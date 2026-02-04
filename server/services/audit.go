package services

import (
	"database/sql"
	"fmt"
	"log"
	"sync"
	"time"
)

// LoginAttempt represents a login attempt record
type LoginAttempt struct {
	ID        int64     `json:"id"`
	Email     string    `json:"email"`
	Name      string    `json:"name"`
	Success   bool      `json:"success"`
	IPAddress string    `json:"ip_address"`
	UserAgent string    `json:"user_agent"`
	Timestamp time.Time `json:"timestamp"`
}

// LoginAttemptFilter for querying login attempts
type LoginAttemptFilter struct {
	Email   string
	Success *bool
}

// AuditService manages audit logging
type AuditService struct {
	db *DB
}

var (
	auditService *AuditService
	auditOnce    sync.Once
)

// GetAuditService returns the singleton AuditService instance
func GetAuditService() *AuditService {
	auditOnce.Do(func() {
		service, err := newAuditService()
		if err != nil {
			log.Fatalf("Failed to initialize AuditService: %v", err)
		}
		auditService = service
	})
	return auditService
}

func newAuditService() (*AuditService, error) {
	db := GetDB()
	// Create login_attempts table
	_, err := db.Exec(`
		CREATE TABLE IF NOT EXISTS login_attempts (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			email TEXT NOT NULL,
			name TEXT,
			success INTEGER NOT NULL,
			ip_address TEXT,
			user_agent TEXT,
			timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
		)
	`)
	if err != nil {
		return nil, fmt.Errorf("failed to create login_attempts table: %w", err)
	}

	// Create index for faster queries
	_, err = db.Exec(`CREATE INDEX IF NOT EXISTS idx_login_attempts_email ON login_attempts(email)`)
	if err != nil {
		return nil, fmt.Errorf("failed to create email index: %w", err)
	}

	_, err = db.Exec(`CREATE INDEX IF NOT EXISTS idx_login_attempts_timestamp ON login_attempts(timestamp DESC)`)
	if err != nil {
		return nil, fmt.Errorf("failed to create timestamp index: %w", err)
	}

	log.Printf("Audit service initialized")

	return &AuditService{
		db: db,
	}, nil
}

// LogLoginAttempt records a login attempt
func (s *AuditService) LogLoginAttempt(attempt LoginAttempt) error {
	_, err := s.db.Exec(
		`INSERT INTO login_attempts (email, name, success, ip_address, user_agent, timestamp)
		 VALUES (?, ?, ?, ?, ?, ?)`,
		attempt.Email,
		attempt.Name,
		boolToInt(attempt.Success),
		attempt.IPAddress,
		attempt.UserAgent,
		attempt.Timestamp,
	)
	if err != nil {
		return fmt.Errorf("failed to log login attempt: %w", err)
	}
	return nil
}

// GetLoginAttempts returns login attempts with pagination and optional filters
func (s *AuditService) GetLoginAttempts(limit, offset int, filter LoginAttemptFilter) ([]LoginAttempt, int, error) {
	// Build query with filters
	whereClause := "1=1"
	args := []interface{}{}

	if filter.Email != "" {
		whereClause += " AND email LIKE ?"
		args = append(args, "%"+filter.Email+"%")
	}

	if filter.Success != nil {
		whereClause += " AND success = ?"
		args = append(args, boolToInt(*filter.Success))
	}

	// Get total count
	countQuery := fmt.Sprintf("SELECT COUNT(*) FROM login_attempts WHERE %s", whereClause)
	var total int
	err := s.db.QueryRow(countQuery, args...).Scan(&total)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to count login attempts: %w", err)
	}

	// Get records
	query := fmt.Sprintf(
		"SELECT id, email, name, success, ip_address, user_agent, timestamp FROM login_attempts WHERE %s ORDER BY timestamp DESC LIMIT ? OFFSET ?",
		whereClause,
	)
	args = append(args, limit, offset)

	rows, err := s.db.Query(query, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to query login attempts: %w", err)
	}
	defer rows.Close()

	attempts := make([]LoginAttempt, 0)
	for rows.Next() {
		var attempt LoginAttempt
		var successInt int
		var name, ipAddress, userAgent sql.NullString
		var timestampStr string

		if err := rows.Scan(&attempt.ID, &attempt.Email, &name, &successInt, &ipAddress, &userAgent, &timestampStr); err != nil {
			return nil, 0, fmt.Errorf("failed to scan login attempt: %w", err)
		}

		attempt.Success = successInt == 1
		attempt.Name = name.String
		attempt.IPAddress = ipAddress.String
		attempt.UserAgent = userAgent.String
		attempt.Timestamp = parseTimestamp(timestampStr)

		attempts = append(attempts, attempt)
	}

	if err := rows.Err(); err != nil {
		return nil, 0, fmt.Errorf("error iterating login attempts: %w", err)
	}

	return attempts, total, nil
}

func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}
