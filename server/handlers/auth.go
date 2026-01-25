package handlers

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"io"
	"log"
	"net/http"

	"birdwatch/config"
	"birdwatch/services"

	"github.com/gin-contrib/sessions"
	"github.com/gin-gonic/gin"
)

type GoogleUserInfo struct {
	Email         string `json:"email"`
	EmailVerified bool   `json:"email_verified"`
	Name          string `json:"name"`
	Picture       string `json:"picture"`
}

func generateStateToken() string {
	b := make([]byte, 32)
	rand.Read(b)
	return base64.URLEncoding.EncodeToString(b)
}

func HandleLogin(c *gin.Context) {
	session := sessions.Default(c)

	// Generate random state for CSRF protection
	state := generateStateToken()
	session.Set("oauth_state", state)
	session.Save()

	url := config.AppConfig.OAuthConfig.AuthCodeURL(state)
	c.Redirect(http.StatusFound, url)
}

func HandleCallback(c *gin.Context) {
	session := sessions.Default(c)
	basePath := config.AppConfig.BasePath

	// Verify state parameter
	state := c.Query("state")
	savedState := session.Get("oauth_state")
	if savedState == nil || state != savedState.(string) {
		log.Printf("OAuth state mismatch: got %s, expected %v", state, savedState)
		c.Redirect(http.StatusFound, basePath+"/?error=invalid_state")
		return
	}

	// Clear the state
	session.Delete("oauth_state")

	// Exchange code for token
	code := c.Query("code")
	if code == "" {
		c.Redirect(http.StatusFound, basePath+"/?error=no_code")
		return
	}

	token, err := config.AppConfig.OAuthConfig.Exchange(context.Background(), code)
	if err != nil {
		log.Printf("OAuth exchange error: %v", err)
		c.Redirect(http.StatusFound, basePath+"/?error=exchange_failed")
		return
	}

	// Get user info
	client := config.AppConfig.OAuthConfig.Client(context.Background(), token)
	resp, err := client.Get("https://www.googleapis.com/oauth2/v2/userinfo")
	if err != nil {
		log.Printf("Failed to get user info: %v", err)
		c.Redirect(http.StatusFound, basePath+"/?error=userinfo_failed")
		return
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		log.Printf("Failed to read user info: %v", err)
		c.Redirect(http.StatusFound, basePath+"/?error=read_failed")
		return
	}

	var userInfo GoogleUserInfo
	if err := json.Unmarshal(body, &userInfo); err != nil {
		log.Printf("Failed to parse user info: %v", err)
		c.Redirect(http.StatusFound, basePath+"/?error=parse_failed")
		return
	}

	// Check if email is allowed
	if !config.AppConfig.IsEmailAllowed(userInfo.Email) {
		log.Printf("Unauthorized email attempted login: %s", userInfo.Email)
		c.Redirect(http.StatusFound, basePath+"/?error=unauthorized")
		return
	}

	// Create session
	session.Set("email", userInfo.Email)
	session.Set("name", userInfo.Name)
	session.Set("picture", userInfo.Picture)
	session.Options(sessions.Options{
		MaxAge:   86400, // 24 hours
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteLaxMode,
		Path:     basePath,
	})
	if err := session.Save(); err != nil {
		log.Printf("Failed to save session: %v", err)
		c.Redirect(http.StatusFound, basePath+"/?error=session_failed")
		return
	}

	// Register active user
	services.GetSessionManager().AddUser(userInfo.Email)

	log.Printf("User logged in: %s", userInfo.Email)
	c.Redirect(http.StatusFound, basePath+"/player")
}

func HandleLogout(c *gin.Context) {
	session := sessions.Default(c)
	basePath := config.AppConfig.BasePath

	// Remove user from active tracking
	email := session.Get("email")
	if email != nil {
		services.GetSessionManager().RemoveUser(email.(string))
	}

	// Clear session
	session.Clear()
	session.Options(sessions.Options{
		MaxAge: -1,
		Path:   basePath,
	})
	session.Save()

	c.Redirect(http.StatusFound, basePath+"/")
}

func HandleUser(c *gin.Context) {
	session := sessions.Default(c)
	email := session.Get("email")
	name := session.Get("name")
	picture := session.Get("picture")

	c.JSON(http.StatusOK, gin.H{
		"email":   email,
		"name":    name,
		"picture": picture,
	})
}
