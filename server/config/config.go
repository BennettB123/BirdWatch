package config

import (
	"bufio"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"

	"github.com/joho/godotenv"
	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"
)

type GoogleAuthConfig struct {
	Web struct {
		ClientID     string   `json:"client_id"`
		ProjectID    string   `json:"project_id"`
		AuthURI      string   `json:"auth_uri"`
		TokenURI     string   `json:"token_uri"`
		ClientSecret string   `json:"client_secret"`
		RedirectURIs []string `json:"redirect_uris"`
	} `json:"web"`
}

type Config struct {
	SessionSecret      string
	PiSecret           string
	StreamKey          string
	AllowedEmailsFile  string
	HLSDir             string
	HLSSegmentDuration int
	HLSListSize        int
	RTMPPort           string
	Port               string
	BasePath           string
	OAuthConfig        *oauth2.Config
	GoogleAuthFile     string

	emailsMu      sync.RWMutex
	allowedEmails map[string]struct{}
}

var AppConfig *Config

func Load() *Config {
	// Load .env file if it exists
	godotenv.Load()

	config := &Config{
		SessionSecret:      requireEnv("BIRDWATCH_SESSION_SECRET"),
		PiSecret:           requireEnv("BIRDWATCH_PI_SECRET"),
		StreamKey:          requireEnv("BIRDWATCH_STREAM_KEY"),
		AllowedEmailsFile:  requireEnv("BIRDWATCH_ALLOWED_EMAILS_FILE"),
		HLSDir:             requireEnv("BIRDWATCH_HLS_DIR"),
		HLSSegmentDuration: requireEnvInt("BIRDWATCH_HLS_SEGMENT_DURATION"),
		HLSListSize:        requireEnvInt("BIRDWATCH_HLS_LIST_SIZE"),
		RTMPPort:           requireEnv("BIRDWATCH_RTMP_PORT"),
		Port:               requireEnv("BIRDWATCH_PORT"),
		BasePath:           requireEnv("BIRDWATCH_BASE_PATH"),
		GoogleAuthFile:     requireEnv("BIRDWATCH_GOOGLE_AUTH_FILE"),
		allowedEmails:      make(map[string]struct{}),
	}

	// Load OAuth config from google_auth.json
	config.OAuthConfig = loadOAuthConfig(config.GoogleAuthFile)

	// Load initial allowed emails
	if err := config.ReloadAllowedEmails(); err != nil {
		log.Fatalf("Failed to load allowed emails file: %v", err)
	}

	AppConfig = config
	return config
}

// resolveFilePath resolves a file path, checking if it's absolute or relative to the working directory
func resolveFilePath(filename string) (string, error) {
	// If it's an absolute path, use it directly
	if filepath.IsAbs(filename) {
		if _, err := os.Stat(filename); err == nil {
			return filename, nil
		}
		return "", fmt.Errorf("file not found at absolute path: %s", filename)
	}

	// Get current working directory
	cwd, err := os.Getwd()
	if err != nil {
		return "", fmt.Errorf("failed to get working directory: %w", err)
	}

	// Try relative to current working directory
	cwdPath := filepath.Join(cwd, filename)
	if _, err := os.Stat(cwdPath); err == nil {
		return cwdPath, nil
	}

	// Try just the filename as-is (might be relative to execution location)
	if _, err := os.Stat(filename); err == nil {
		return filename, nil
	}

	return "", fmt.Errorf("file not found: %s", filename)
}

func loadOAuthConfig(filename string) *oauth2.Config {
	resolvedPath, err := resolveFilePath(filename)
	if err != nil {
		log.Fatalf("Could not find OAuth config file: %v", err)
	}

	data, err := os.ReadFile(resolvedPath)
	if err != nil {
		log.Fatalf("Could not read OAuth config file %s: %v", resolvedPath, err)
	}

	var googleAuth GoogleAuthConfig
	if err := json.Unmarshal(data, &googleAuth); err != nil {
		log.Fatalf("Could not parse OAuth config file %s: %v", filename, err)
	}

	if len(googleAuth.Web.RedirectURIs) == 0 {
		log.Fatalf("No redirect URIs found in %s", filename)
	}

	return &oauth2.Config{
		ClientID:     googleAuth.Web.ClientID,
		ClientSecret: googleAuth.Web.ClientSecret,
		RedirectURL:  googleAuth.Web.RedirectURIs[0],
		Scopes:       []string{"email", "profile"},
		Endpoint:     google.Endpoint,
	}
}

func requireEnv(key string) string {
	value := os.Getenv(key)
	if value == "" {
		log.Fatalf("Required environment variable %s is not set", key)
	}
	return value
}

func requireEnvInt(key string) int {
	value := requireEnv(key)
	intVal, err := strconv.Atoi(value)
	if err != nil {
		log.Fatalf("Environment variable %s must be an integer, got: %s", key, value)
	}
	if intVal <= 0 {
		log.Fatalf("Environment variable %s must be a positive integer, got: %d", key, intVal)
	}
	return intVal
}

// ReloadAllowedEmails reads the allowed emails file and updates the in-memory list.
// This can be called at runtime to pick up changes without restarting the server.
func (c *Config) ReloadAllowedEmails() error {
	resolvedPath, err := resolveFilePath(c.AllowedEmailsFile)
	if err != nil {
		return fmt.Errorf("failed to find allowed emails file: %w", err)
	}

	file, err := os.Open(resolvedPath)
	if err != nil {
		return fmt.Errorf("failed to open allowed emails file: %w", err)
	}
	defer file.Close()

	emails := make(map[string]struct{})
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		// Skip empty lines and comments
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		emails[strings.ToLower(line)] = struct{}{}
	}

	if err := scanner.Err(); err != nil {
		return fmt.Errorf("failed to read allowed emails file: %w", err)
	}

	if len(emails) == 0 {
		return fmt.Errorf("allowed emails file is empty or contains no valid emails")
	}

	c.emailsMu.Lock()
	c.allowedEmails = emails
	c.emailsMu.Unlock()

	log.Printf("Loaded %d allowed emails from %s", len(emails), resolvedPath)
	return nil
}

func (c *Config) IsEmailAllowed(email string) bool {
	c.ReloadAllowedEmails()
	email = strings.ToLower(strings.TrimSpace(email))

	c.emailsMu.RLock()
	_, allowed := c.allowedEmails[email]
	c.emailsMu.RUnlock()

	return allowed
}

func (c *Config) GetAllowedEmailCount() int {
	c.emailsMu.RLock()
	defer c.emailsMu.RUnlock()
	return len(c.allowedEmails)
}
