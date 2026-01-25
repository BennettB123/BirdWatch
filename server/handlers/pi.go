package handlers

import (
	"net/http"

	"birdwatch/services"

	"github.com/gin-gonic/gin"
)

// HandlePiStatus returns whether streaming should be active
// Called by Pi to determine if it should start/stop streaming
func HandlePiStatus(c *gin.Context) {
	sessionMgr := services.GetSessionManager()
	hasActiveUsers := sessionMgr.HasActiveUsers()

	c.JSON(http.StatusOK, gin.H{
		"stream":      hasActiveUsers,
		"user_count":  sessionMgr.GetActiveUserCount(),
	})
}

// HandleStreamStatus returns current stream status for admin/debugging
func HandleStreamStatus(c *gin.Context) {
	sessionMgr := services.GetSessionManager()

	c.JSON(http.StatusOK, gin.H{
		"active_users": sessionMgr.GetActiveUserCount(),
		"users":        sessionMgr.GetActiveUsers(),
		"should_stream": sessionMgr.HasActiveUsers(),
	})
}
