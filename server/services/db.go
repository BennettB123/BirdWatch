package services

import (
	"database/sql"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sync"

	"birdwatch/config"

	_ "modernc.org/sqlite"
)

// DB provides shared database access
type DB struct {
	*sql.DB
	dataDir string
}

var (
	dbInstance *DB
	dbOnce     sync.Once
)

// GetDB returns the singleton database instance
func GetDB() *DB {
	dbOnce.Do(func() {
		cfg := config.AppConfig
		if cfg == nil {
			log.Fatal("Config not loaded before initializing database")
		}

		db, err := initDB(cfg.DataDir)
		if err != nil {
			log.Fatalf("Failed to initialize database: %v", err)
		}
		dbInstance = db
	})
	return dbInstance
}

func initDB(dataDir string) (*DB, error) {
	// Create data directory
	if err := os.MkdirAll(dataDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create data directory: %w", err)
	}

	// Open SQLite database
	dbPath := filepath.Join(dataDir, "birdwatch.db")
	sqlDB, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

	log.Printf("Database initialized: %s", dbPath)

	return &DB{
		DB:      sqlDB,
		dataDir: dataDir,
	}, nil
}

// DataDir returns the data directory path
func (db *DB) DataDir() string {
	return db.dataDir
}
