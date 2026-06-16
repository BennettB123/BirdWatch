package services

import (
	"database/sql"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

// Sighting represents a bird sighting record
type Sighting struct {
	ID         int64     `json:"id"`
	Timestamp  time.Time `json:"timestamp"`
	ImagePaths []string  `json:"image_paths"`
	CreatedAt  time.Time `json:"created_at"`
	Favorite   bool      `json:"favorite"`
}

type SightingFilters struct {
	FavoritesOnly bool
	StartDate     *time.Time
	EndDate       *time.Time
}

// SightingService manages bird sightings storage
type SightingService struct {
	db       *DB
	imageDir string
}

var (
	sightingService *SightingService
	sightingOnce    sync.Once
)

// GetSightingService returns the singleton SightingService instance
func GetSightingService() *SightingService {
	sightingOnce.Do(func() {
		service, err := newSightingService()
		if err != nil {
			log.Fatalf("Failed to initialize SightingService: %v", err)
		}
		sightingService = service
	})
	return sightingService
}

func newSightingService() (*SightingService, error) {
	db := GetDB()

	// Create images subdirectory
	imageDir := filepath.Join(db.DataDir(), "sightings")
	if err := os.MkdirAll(imageDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create images directory: %w", err)
	}

	// Create sightings table
	_, err := db.Exec(`
		CREATE TABLE IF NOT EXISTS sightings (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			timestamp DATETIME NOT NULL,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)
	`)
	if err != nil {
		return nil, fmt.Errorf("failed to create sightings table: %w", err)
	}

	if err := ensureFavoriteColumn(db); err != nil {
		return nil, err
	}

	// Create sighting_images table
	_, err = db.Exec(`
		CREATE TABLE IF NOT EXISTS sighting_images (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			sighting_id INTEGER NOT NULL,
			image_path TEXT NOT NULL,
			capture_order INTEGER NOT NULL DEFAULT 0,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (sighting_id) REFERENCES sightings(id) ON DELETE CASCADE
		)
	`)
	if err != nil {
		return nil, fmt.Errorf("failed to create sighting_images table: %w", err)
	}

	// Create index on sighting_id for faster lookups
	_, err = db.Exec(`
		CREATE INDEX IF NOT EXISTS idx_sighting_images_sighting_id
		ON sighting_images(sighting_id)
	`)
	if err != nil {
		return nil, fmt.Errorf("failed to create sighting_images index: %w", err)
	}

	log.Printf("Sighting service initialized: images=%s", imageDir)

	return &SightingService{
		db:       db,
		imageDir: imageDir,
	}, nil
}

// CreateSighting saves a new sighting with its images
func (s *SightingService) CreateSighting(timestamp time.Time, images []io.Reader) (*Sighting, error) {
	if len(images) == 0 {
		return nil, fmt.Errorf("at least one image is required")
	}

	// Insert sighting into database
	result, err := s.db.Exec(
		"INSERT INTO sightings (timestamp) VALUES (?)",
		timestamp,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to insert sighting: %w", err)
	}

	id, err := result.LastInsertId()
	if err != nil {
		return nil, fmt.Errorf("failed to get sighting ID: %w", err)
	}

	// Save each image
	savedPaths := make([]string, 0, len(images))
	for i, imageData := range images {
		// Generate unique filename
		filename := fmt.Sprintf("%d_%d.jpg", time.Now().UnixNano(), i)
		imagePath := filepath.Join(s.imageDir, filename)

		// Save image to disk
		file, err := os.Create(imagePath)
		if err != nil {
			// Cleanup already saved images
			for _, p := range savedPaths {
				os.Remove(filepath.Join(s.imageDir, p))
			}
			s.db.Exec("DELETE FROM sightings WHERE id = ?", id)
			s.db.Exec("DELETE FROM sighting_images WHERE sighting_id = ?", id)
			return nil, fmt.Errorf("failed to create image file: %w", err)
		}

		if _, err := io.Copy(file, imageData); err != nil {
			file.Close()
			os.Remove(imagePath)
			// Cleanup already saved images
			for _, p := range savedPaths {
				os.Remove(filepath.Join(s.imageDir, p))
			}
			s.db.Exec("DELETE FROM sightings WHERE id = ?", id)
			s.db.Exec("DELETE FROM sighting_images WHERE sighting_id = ?", id)
			return nil, fmt.Errorf("failed to write image file: %w", err)
		}
		file.Close()

		// Insert image reference into database
		_, err = s.db.Exec(
			"INSERT INTO sighting_images (sighting_id, image_path, capture_order) VALUES (?, ?, ?)",
			id, filename, i,
		)
		if err != nil {
			os.Remove(imagePath)
			// Cleanup already saved images
			for _, p := range savedPaths {
				os.Remove(filepath.Join(s.imageDir, p))
			}
			s.db.Exec("DELETE FROM sightings WHERE id = ?", id)
			s.db.Exec("DELETE FROM sighting_images WHERE sighting_id = ?", id)
			return nil, fmt.Errorf("failed to insert image reference: %w", err)
		}

		savedPaths = append(savedPaths, filename)
	}

	return &Sighting{
		ID:         id,
		Timestamp:  timestamp,
		ImagePaths: savedPaths,
		CreatedAt:  time.Now(),
		Favorite:   false,
	}, nil
}

func ensureFavoriteColumn(db *DB) error {
	var favoriteColumnExists bool
	rows, err := db.Query("PRAGMA table_info(sightings)")
	if err != nil {
		return fmt.Errorf("failed to inspect sightings table: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var cid int
		var name, columnType string
		var notNull int
		var defaultValue sql.NullString
		var pk int
		if err := rows.Scan(&cid, &name, &columnType, &notNull, &defaultValue, &pk); err != nil {
			return fmt.Errorf("failed to scan sightings table info: %w", err)
		}
		if name == "favorite" {
			favoriteColumnExists = true
			break
		}
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("failed to inspect sightings table columns: %w", err)
	}

	if favoriteColumnExists {
		return nil
	}

	_, err = db.Exec("ALTER TABLE sightings ADD COLUMN favorite INTEGER NOT NULL DEFAULT 0")
	if err != nil {
		return fmt.Errorf("failed to add favorite column to sightings: %w", err)
	}
	return nil
}

// parseTimestamp tries multiple formats to parse a timestamp string
func parseTimestamp(s string) time.Time {
	formats := []string{
		"2006-01-02 15:04:05.999999999 -0700 -0700", // Go time.Time.String() with duplicate tz
		"2006-01-02 15:04:05.999999999 -0700 MST",   // Go time.Time.String() format
		"2006-01-02 15:04:05.999999 -0700 -0700",    // Go format with microseconds
		time.RFC3339Nano,                            // 2006-01-02T15:04:05.999999999Z07:00
		time.RFC3339,                                // 2006-01-02T15:04:05Z07:00
		"2006-01-02T15:04:05.000000-07:00",          // Python isoformat with microseconds and timezone
		"2006-01-02T15:04:05.000000",                // Python isoformat with microseconds, no timezone
		"2006-01-02T15:04:05-07:00",                 // ISO with timezone, no fractional
		"2006-01-02T15:04:05",                       // ISO without timezone or fractional seconds
		"2006-01-02 15:04:05",                       // SQLite datetime format
	}
	for _, format := range formats {
		if t, err := time.Parse(format, s); err == nil {
			return t
		}
	}
	return time.Time{}
}

func buildSightingFilterWhere(filters SightingFilters) (string, []interface{}) {
	conditions := make([]string, 0, 3)
	args := make([]interface{}, 0, 3)

	if filters.FavoritesOnly {
		conditions = append(conditions, "s.favorite = 1")
	}
	if filters.StartDate != nil {
		conditions = append(conditions, "s.timestamp >= ?")
		args = append(args, filters.StartDate.Format("2006-01-02 15:04:05"))
	}
	if filters.EndDate != nil {
		conditions = append(conditions, "s.timestamp < ?")
		args = append(args, filters.EndDate.AddDate(0, 0, 1).Format("2006-01-02 15:04:05"))
	}

	if len(conditions) == 0 {
		return "", args
	}
	return "WHERE " + strings.Join(conditions, " AND "), args
}

// GetSightings returns sightings with pagination (newest first)
func (s *SightingService) GetSightings(limit, offset int, filters SightingFilters) ([]Sighting, error) {
	whereClause, args := buildSightingFilterWhere(filters)
	args = append(args, limit, offset)

	// Query sightings with aggregated image paths
	rows, err := s.db.Query(fmt.Sprintf(`
		SELECT s.id, s.timestamp, s.created_at, s.favorite,
			GROUP_CONCAT(si.image_path ORDER BY si.capture_order) as image_paths
		FROM sightings s
		LEFT JOIN sighting_images si ON s.id = si.sighting_id
		%s
		GROUP BY s.id
		ORDER BY s.timestamp DESC
		LIMIT ? OFFSET ?`, whereClause), args...)
	if err != nil {
		return nil, fmt.Errorf("failed to query sightings: %w", err)
	}
	defer rows.Close()

	sightings := make([]Sighting, 0) // Initialize as empty slice, not nil
	for rows.Next() {
		var sighting Sighting
		var timestampStr, createdAtStr string
		var imagePathsStr *string
		var favorite int
		if err := rows.Scan(&sighting.ID, &timestampStr, &createdAtStr, &favorite, &imagePathsStr); err != nil {
			return nil, fmt.Errorf("failed to scan sighting: %w", err)
		}
		sighting.Timestamp = parseTimestamp(timestampStr)
		sighting.CreatedAt = parseTimestamp(createdAtStr)
		sighting.Favorite = favorite == 1

		// Parse comma-separated image paths
		if imagePathsStr != nil && *imagePathsStr != "" {
			sighting.ImagePaths = strings.Split(*imagePathsStr, ",")
		} else {
			sighting.ImagePaths = []string{}
		}

		sightings = append(sightings, sighting)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating sightings: %w", err)
	}

	return sightings, nil
}

// GetSightingCount returns the total number of sightings
func (s *SightingService) GetSightingCount(filters SightingFilters) (int, error) {
	var count int
	whereClause, args := buildSightingFilterWhere(filters)
	err := s.db.QueryRow(fmt.Sprintf("SELECT COUNT(*) FROM sightings s %s", whereClause), args...).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("failed to count sightings: %w", err)
	}
	return count, nil
}

func (s *SightingService) SetFavorite(id int64, favorite bool) (*Sighting, error) {
	favoriteValue := 0
	if favorite {
		favoriteValue = 1
	}

	result, err := s.db.Exec("UPDATE sightings SET favorite = ? WHERE id = ?", favoriteValue, id)
	if err != nil {
		return nil, fmt.Errorf("failed to update favorite: %w", err)
	}
	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return nil, fmt.Errorf("failed to check favorite update result: %w", err)
	}
	if rowsAffected == 0 {
		return nil, fmt.Errorf("sighting not found")
	}

	return &Sighting{ID: id, Favorite: favorite}, nil
}

// GetImagePath returns the full path to a sighting's image
func (s *SightingService) GetImagePath(filename string) string {
	return filepath.Join(s.imageDir, filename)
}

// DeleteSighting removes a sighting and all its images
func (s *SightingService) DeleteSighting(id int64) error {
	// Get all image paths first
	rows, err := s.db.Query("SELECT image_path FROM sighting_images WHERE sighting_id = ?", id)
	if err != nil {
		return fmt.Errorf("failed to query sighting images: %w", err)
	}

	var imagePaths []string
	for rows.Next() {
		var imagePath string
		if err := rows.Scan(&imagePath); err != nil {
			rows.Close()
			return fmt.Errorf("failed to scan image path: %w", err)
		}
		imagePaths = append(imagePaths, imagePath)
	}
	rows.Close()

	// Check if sighting exists
	var exists int
	err = s.db.QueryRow("SELECT 1 FROM sightings WHERE id = ?", id).Scan(&exists)
	if err != nil {
		return fmt.Errorf("sighting not found: %w", err)
	}

	// Delete from sighting_images table
	_, err = s.db.Exec("DELETE FROM sighting_images WHERE sighting_id = ?", id)
	if err != nil {
		return fmt.Errorf("failed to delete sighting images: %w", err)
	}

	// Delete from sightings table
	_, err = s.db.Exec("DELETE FROM sightings WHERE id = ?", id)
	if err != nil {
		return fmt.Errorf("failed to delete sighting: %w", err)
	}

	// Delete image files
	for _, imagePath := range imagePaths {
		fullPath := filepath.Join(s.imageDir, imagePath)
		os.Remove(fullPath) // Ignore error if file doesn't exist
	}

	return nil
}
