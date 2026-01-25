package handlers

import (
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"birdwatch/config"
	"birdwatch/services"

	"github.com/gin-contrib/sessions"
	"github.com/gin-gonic/gin"
)

// HandlePlaylist serves the HLS playlist (m3u8)
func HandlePlaylist(c *gin.Context) {
	session := sessions.Default(c)
	email := session.Get("email")
	if email != nil {
		services.GetSessionManager().Heartbeat(email.(string))
	}

	playlistPath := filepath.Join(config.AppConfig.HLSDir, "playlist.m3u8")

	// Check if playlist exists
	if _, err := os.Stat(playlistPath); os.IsNotExist(err) {
		c.JSON(http.StatusServiceUnavailable, gin.H{
			"error":   "stream_not_available",
			"message": "No active stream",
		})
		return
	}

	// Set appropriate headers for HLS
	c.Header("Content-Type", "application/vnd.apple.mpegurl")
	c.Header("Cache-Control", "no-cache, no-store, must-revalidate")
	c.Header("Access-Control-Allow-Origin", "*")

	c.File(playlistPath)
}

// HandleSegment serves HLS segments (.ts files)
func HandleSegment(c *gin.Context) {
	session := sessions.Default(c)
	email := session.Get("email")
	if email != nil {
		services.GetSessionManager().Heartbeat(email.(string))
	}

	segment := c.Param("segment")

	// Security: prevent directory traversal
	if strings.Contains(segment, "..") || strings.Contains(segment, "/") || strings.Contains(segment, "\\") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid segment name"})
		return
	}

	// Only allow .ts files
	if !strings.HasSuffix(segment, ".ts") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid segment type"})
		return
	}

	segmentPath := filepath.Join(config.AppConfig.HLSDir, segment)

	// Check if segment exists
	if _, err := os.Stat(segmentPath); os.IsNotExist(err) {
		c.JSON(http.StatusNotFound, gin.H{"error": "segment not found"})
		return
	}

	// Set appropriate headers
	c.Header("Content-Type", "video/mp2t")
	c.Header("Cache-Control", "max-age=3600")
	c.Header("Access-Control-Allow-Origin", "*")

	c.File(segmentPath)
}

// HandleHeartbeat handles heartbeat requests from the player
func HandleHeartbeat(c *gin.Context) {
	email, exists := c.Get("email")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}

	services.GetSessionManager().Heartbeat(email.(string))

	c.JSON(http.StatusOK, gin.H{
		"status": "ok",
	})
}
