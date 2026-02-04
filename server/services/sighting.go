package services

import (
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"sync"
	"time"
)

// Sighting represents a bird sighting record
type Sighting struct {
	ID        int64     `json:"id"`
	Timestamp time.Time `json:"timestamp"`
	ImagePath string    `json:"image_path"`
	CreatedAt time.Time `json:"created_at"`
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
			image_path TEXT NOT NULL,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)
	`)
	if err != nil {
		return nil, fmt.Errorf("failed to create sightings table: %w", err)
	}

	log.Printf("Sighting service initialized: images=%s", imageDir)

	return &SightingService{
		db:       db,
		imageDir: imageDir,
	}, nil
}

// CreateSighting saves a new sighting with its image
func (s *SightingService) CreateSighting(timestamp time.Time, imageData io.Reader) (*Sighting, error) {
	// Generate unique filename
	filename := fmt.Sprintf("%d.jpg", time.Now().UnixNano())
	imagePath := filepath.Join(s.imageDir, filename)

	// Save image to disk
	file, err := os.Create(imagePath)
	if err != nil {
		return nil, fmt.Errorf("failed to create image file: %w", err)
	}
	defer file.Close()

	if _, err := io.Copy(file, imageData); err != nil {
		os.Remove(imagePath)
		return nil, fmt.Errorf("failed to write image file: %w", err)
	}

	// Insert into database (store relative path)
	result, err := s.db.Exec(
		"INSERT INTO sightings (timestamp, image_path) VALUES (?, ?)",
		timestamp, filename,
	)
	if err != nil {
		os.Remove(imagePath)
		return nil, fmt.Errorf("failed to insert sighting: %w", err)
	}

	id, err := result.LastInsertId()
	if err != nil {
		return nil, fmt.Errorf("failed to get sighting ID: %w", err)
	}

	return &Sighting{
		ID:        id,
		Timestamp: timestamp,
		ImagePath: filename,
		CreatedAt: time.Now(),
	}, nil
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

// GetSightings returns sightings with pagination (newest first)
func (s *SightingService) GetSightings(limit, offset int) ([]Sighting, error) {
	rows, err := s.db.Query(
		"SELECT id, timestamp, image_path, created_at FROM sightings ORDER BY timestamp DESC LIMIT ? OFFSET ?",
		limit, offset,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to query sightings: %w", err)
	}
	defer rows.Close()

	sightings := make([]Sighting, 0) // Initialize as empty slice, not nil
	for rows.Next() {
		var sighting Sighting
		var timestampStr, createdAtStr string
		if err := rows.Scan(&sighting.ID, &timestampStr, &sighting.ImagePath, &createdAtStr); err != nil {
			return nil, fmt.Errorf("failed to scan sighting: %w", err)
		}
		sighting.Timestamp = parseTimestamp(timestampStr)
		sighting.CreatedAt = parseTimestamp(createdAtStr)
		sightings = append(sightings, sighting)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating sightings: %w", err)
	}

	return sightings, nil
}

// GetSightingCount returns the total number of sightings
func (s *SightingService) GetSightingCount() (int, error) {
	var count int
	err := s.db.QueryRow("SELECT COUNT(*) FROM sightings").Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("failed to count sightings: %w", err)
	}
	return count, nil
}

// GetImagePath returns the full path to a sighting's image
func (s *SightingService) GetImagePath(filename string) string {
	return filepath.Join(s.imageDir, filename)
}

// DeleteSighting removes a sighting and its image
func (s *SightingService) DeleteSighting(id int64) error {
	// Get image path first
	var imagePath string
	err := s.db.QueryRow("SELECT image_path FROM sightings WHERE id = ?", id).Scan(&imagePath)
	if err != nil {
		return fmt.Errorf("sighting not found: %w", err)
	}

	// Delete from database
	_, err = s.db.Exec("DELETE FROM sightings WHERE id = ?", id)
	if err != nil {
		return fmt.Errorf("failed to delete sighting: %w", err)
	}

	// Delete image file
	fullPath := filepath.Join(s.imageDir, imagePath)
	os.Remove(fullPath) // Ignore error if file doesn't exist

	return nil
}
