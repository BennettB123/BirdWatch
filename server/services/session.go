package services

import (
	"sync"
	"time"
)

type UserSession struct {
	Email      string
	LastActive time.Time
}

type SessionManager struct {
	mu       sync.RWMutex
	users    map[string]*UserSession
	timeout  time.Duration
	stopChan chan struct{}
}

var (
	sessionManager *SessionManager
	sessionOnce    sync.Once
)

func GetSessionManager() *SessionManager {
	sessionOnce.Do(func() {
		sessionManager = &SessionManager{
			users:    make(map[string]*UserSession),
			timeout:  30 * time.Second, // Timeout after 30 seconds without heartbeat
			stopChan: make(chan struct{}),
		}
		go sessionManager.cleanupLoop()
	})
	return sessionManager
}

func (sm *SessionManager) AddUser(email string) {
	sm.mu.Lock()
	defer sm.mu.Unlock()
	sm.users[email] = &UserSession{
		Email:      email,
		LastActive: time.Now(),
	}
}

func (sm *SessionManager) RemoveUser(email string) {
	sm.mu.Lock()
	defer sm.mu.Unlock()
	delete(sm.users, email)
}

func (sm *SessionManager) Heartbeat(email string) {
	sm.mu.Lock()
	defer sm.mu.Unlock()
	if user, exists := sm.users[email]; exists {
		user.LastActive = time.Now()
	} else {
		// User not tracked, add them
		sm.users[email] = &UserSession{
			Email:      email,
			LastActive: time.Now(),
		}
	}
}

func (sm *SessionManager) HasActiveUsers() bool {
	sm.mu.RLock()
	defer sm.mu.RUnlock()
	return len(sm.users) > 0
}

func (sm *SessionManager) GetActiveUserCount() int {
	sm.mu.RLock()
	defer sm.mu.RUnlock()
	return len(sm.users)
}

func (sm *SessionManager) GetActiveUsers() []string {
	sm.mu.RLock()
	defer sm.mu.RUnlock()
	users := make([]string, 0, len(sm.users))
	for email := range sm.users {
		users = append(users, email)
	}
	return users
}

func (sm *SessionManager) cleanupLoop() {
	ticker := time.NewTicker(10 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			sm.cleanupInactiveUsers()
		case <-sm.stopChan:
			return
		}
	}
}

func (sm *SessionManager) cleanupInactiveUsers() {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	now := time.Now()
	for email, user := range sm.users {
		if now.Sub(user.LastActive) > sm.timeout {
			delete(sm.users, email)
		}
	}
}

func (sm *SessionManager) Stop() {
	close(sm.stopChan)
}
