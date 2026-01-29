package services

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
)

const pushoverAPIURL = "https://api.pushover.net/1/messages.json"

// Priority levels for Pushover notifications
const (
	PriorityLowest    = iota - 2 // -2: Lowest priority
	PriorityLow                  // -1: Low priority
	PriorityNormal               //  0: Normal priority (default)
	PriorityHigh                 //  1: High priority
	PriorityEmergency            //  2: Emergency priority (requires acknowledgment)
)

// NotificationService handles sending push notifications via Pushover
type NotificationService struct {
	apiToken string
	userKey  string
	client   *http.Client
}

// NotificationOptions configures a notification message
type NotificationOptions struct {
	Title    string // Message title
	Message  string // Message body (required)
	Priority int    // Priority level (use Priority* constants), default PriorityNormal
	URL      string // Supplementary URL
	URLTitle string // Title for the URL
}

// PushoverResponse represents the API response from Pushover
type PushoverResponse struct {
	Status  int      `json:"status"`
	Request string   `json:"request"`
	Errors  []string `json:"errors,omitempty"`
}

// NewNotificationService creates a new notification service
func NewNotificationService(apiToken, userKey string) *NotificationService {
	return &NotificationService{
		apiToken: apiToken,
		userKey:  userKey,
		client:   &http.Client{},
	}
}

// SendNotification sends a push notification via Pushover
func (service *NotificationService) SendNotification(opts NotificationOptions) error {
	if opts.Message == "" {
		return fmt.Errorf("message is required")
	}

	payload := map[string]interface{}{
		"token":   service.apiToken,
		"user":    service.userKey,
		"message": opts.Message,
	}

	if opts.Title != "" {
		payload["title"] = opts.Title
	}
	if opts.Priority != PriorityNormal {
		payload["priority"] = opts.Priority
	}
	if opts.URL != "" {
		payload["url"] = opts.URL
	}
	if opts.URLTitle != "" {
		payload["url_title"] = opts.URLTitle
	}

	jsonData, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("failed to marshal notification payload: %w", err)
	}

	req, err := http.NewRequest("POST", pushoverAPIURL, bytes.NewBuffer(jsonData))
	if err != nil {
		return fmt.Errorf("failed to create HTTP request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := service.client.Do(req)
	if err != nil {
		return fmt.Errorf("failed to send notification: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("failed to read response body: %w", err)
	}

	var pushoverResp PushoverResponse
	if err := json.Unmarshal(body, &pushoverResp); err != nil {
		return fmt.Errorf("failed to parse response: %w", err)
	}

	if pushoverResp.Status != 1 {
		if len(pushoverResp.Errors) > 0 {
			return fmt.Errorf("pushover API error: %v", pushoverResp.Errors)
		}
		return fmt.Errorf("pushover API returned status %d", pushoverResp.Status)
	}

	return nil
}
