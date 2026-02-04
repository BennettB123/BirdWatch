package services

import (
	"bufio"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"birdwatch/config"
)

// User represents a user with their role
type User struct {
	Email string `json:"email"`
	Role  string `json:"role"`
}

// UserService manages users in the CSV file
type UserService struct {
	mu sync.Mutex
}

var (
	userService *UserService
	userOnce    sync.Once
)

// GetUserService returns the singleton UserService instance
func GetUserService() *UserService {
	userOnce.Do(func() {
		userService = &UserService{}
	})
	return userService
}

// resolveFilePath resolves the allowed emails file path
func (s *UserService) resolveFilePath() (string, error) {
	filename := config.AppConfig.AllowedEmailsFile

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

	// Try just the filename as-is
	if _, err := os.Stat(filename); err == nil {
		return filename, nil
	}

	return "", fmt.Errorf("file not found: %s", filename)
}

// GetAllUsers returns all users from the CSV file
func (s *UserService) GetAllUsers() ([]User, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	filePath, err := s.resolveFilePath()
	if err != nil {
		return nil, err
	}

	file, err := os.Open(filePath)
	if err != nil {
		return nil, fmt.Errorf("failed to open users file: %w", err)
	}
	defer file.Close()

	users := make([]User, 0)
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}

		parts := strings.SplitN(line, ",", 2)
		email := strings.ToLower(strings.TrimSpace(parts[0]))
		role := "user"
		if len(parts) > 1 {
			role = strings.ToLower(strings.TrimSpace(parts[1]))
			if role != "admin" && role != "user" {
				role = "user"
			}
		}

		users = append(users, User{Email: email, Role: role})
	}

	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("failed to read users file: %w", err)
	}

	return users, nil
}

// AddUser adds a new user to the CSV file
func (s *UserService) AddUser(email, role string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	email = strings.ToLower(strings.TrimSpace(email))
	role = strings.ToLower(strings.TrimSpace(role))

	if email == "" {
		return fmt.Errorf("email is required")
	}

	if role != "admin" && role != "user" {
		return fmt.Errorf("role must be 'admin' or 'user'")
	}

	filePath, err := s.resolveFilePath()
	if err != nil {
		return err
	}

	// Check if user already exists
	users, err := s.getAllUsersUnlocked(filePath)
	if err != nil {
		return err
	}

	for _, u := range users {
		if u.Email == email {
			return fmt.Errorf("user already exists: %s", email)
		}
	}

	// Append to file
	file, err := os.OpenFile(filePath, os.O_APPEND|os.O_WRONLY, 0644)
	if err != nil {
		return fmt.Errorf("failed to open users file: %w", err)
	}
	defer file.Close()

	_, err = file.WriteString(fmt.Sprintf("%s,%s\n", email, role))
	if err != nil {
		return fmt.Errorf("failed to write user: %w", err)
	}

	// Reload config
	config.AppConfig.ReloadAllowedEmails()

	return nil
}

// UpdateUserRole updates a user's role
func (s *UserService) UpdateUserRole(email, role string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	email = strings.ToLower(strings.TrimSpace(email))
	role = strings.ToLower(strings.TrimSpace(role))

	if role != "admin" && role != "user" {
		return fmt.Errorf("role must be 'admin' or 'user'")
	}

	filePath, err := s.resolveFilePath()
	if err != nil {
		return err
	}

	users, comments, err := s.readFileWithComments(filePath)
	if err != nil {
		return err
	}

	// Find and update user
	found := false
	for i, u := range users {
		if u.Email == email {
			users[i].Role = role
			found = true
			break
		}
	}

	if !found {
		return fmt.Errorf("user not found: %s", email)
	}

	// Rewrite file
	if err := s.writeFile(filePath, users, comments); err != nil {
		return err
	}

	// Reload config
	config.AppConfig.ReloadAllowedEmails()

	return nil
}

// RemoveUser removes a user from the CSV file
func (s *UserService) RemoveUser(email string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	email = strings.ToLower(strings.TrimSpace(email))

	filePath, err := s.resolveFilePath()
	if err != nil {
		return err
	}

	users, comments, err := s.readFileWithComments(filePath)
	if err != nil {
		return err
	}

	// Check if this is the last admin
	adminCount := 0
	isAdmin := false
	for _, u := range users {
		if u.Role == "admin" {
			adminCount++
		}
		if u.Email == email && u.Role == "admin" {
			isAdmin = true
		}
	}

	if isAdmin && adminCount == 1 {
		return fmt.Errorf("cannot remove the last admin user")
	}

	// Remove user
	newUsers := make([]User, 0, len(users)-1)
	found := false
	for _, u := range users {
		if u.Email == email {
			found = true
			continue
		}
		newUsers = append(newUsers, u)
	}

	if !found {
		return fmt.Errorf("user not found: %s", email)
	}

	// Rewrite file
	if err := s.writeFile(filePath, newUsers, comments); err != nil {
		return err
	}

	// Reload config
	config.AppConfig.ReloadAllowedEmails()

	return nil
}

// Helper to get users without acquiring lock (for internal use)
func (s *UserService) getAllUsersUnlocked(filePath string) ([]User, error) {
	file, err := os.Open(filePath)
	if err != nil {
		return nil, fmt.Errorf("failed to open users file: %w", err)
	}
	defer file.Close()

	users := make([]User, 0)
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}

		parts := strings.SplitN(line, ",", 2)
		email := strings.ToLower(strings.TrimSpace(parts[0]))
		role := "user"
		if len(parts) > 1 {
			role = strings.ToLower(strings.TrimSpace(parts[1]))
		}

		users = append(users, User{Email: email, Role: role})
	}

	return users, scanner.Err()
}

// Helper to read file preserving comments
func (s *UserService) readFileWithComments(filePath string) ([]User, []string, error) {
	file, err := os.Open(filePath)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to open users file: %w", err)
	}
	defer file.Close()

	users := make([]User, 0)
	comments := make([]string, 0)
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := scanner.Text()
		trimmed := strings.TrimSpace(line)

		if trimmed == "" || strings.HasPrefix(trimmed, "#") {
			comments = append(comments, line)
			continue
		}

		parts := strings.SplitN(trimmed, ",", 2)
		email := strings.ToLower(strings.TrimSpace(parts[0]))
		role := "user"
		if len(parts) > 1 {
			role = strings.ToLower(strings.TrimSpace(parts[1]))
		}

		users = append(users, User{Email: email, Role: role})
	}

	return users, comments, scanner.Err()
}

// Helper to write file with comments header
func (s *UserService) writeFile(filePath string, users []User, comments []string) error {
	file, err := os.Create(filePath)
	if err != nil {
		return fmt.Errorf("failed to create users file: %w", err)
	}
	defer file.Close()

	// Write comments first
	for _, comment := range comments {
		file.WriteString(comment + "\n")
	}

	// Write users
	for _, u := range users {
		file.WriteString(fmt.Sprintf("%s,%s\n", u.Email, u.Role))
	}

	return nil
}
