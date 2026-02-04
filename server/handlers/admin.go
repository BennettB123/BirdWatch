package handlers

import (
	"net/http"
	"strconv"

	"birdwatch/services"

	"github.com/gin-gonic/gin"
)

// HandleGetLoginAttempts returns paginated login attempts
func HandleGetLoginAttempts(c *gin.Context) {
	// Parse pagination parameters
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))

	if limit <= 0 || limit > 100 {
		limit = 50
	}
	if offset < 0 {
		offset = 0
	}

	// Parse filters
	filter := services.LoginAttemptFilter{
		Email: c.Query("email"),
	}

	if successStr := c.Query("success"); successStr != "" {
		success := successStr == "true" || successStr == "1"
		filter.Success = &success
	}

	auditSvc := services.GetAuditService()
	attempts, total, err := auditSvc.GetLoginAttempts(limit, offset, filter)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"attempts": attempts,
		"total":    total,
		"limit":    limit,
		"offset":   offset,
	})
}

// HandleGetUsers returns all users
func HandleGetUsers(c *gin.Context) {
	userSvc := services.GetUserService()
	users, err := userSvc.GetAllUsers()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"users": users,
	})
}

// HandleAddUser adds a new user
func HandleAddUser(c *gin.Context) {
	var req struct {
		Email string `json:"email" binding:"required"`
		Role  string `json:"role" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "email and role are required"})
		return
	}

	userSvc := services.GetUserService()
	if err := userSvc.AddUser(req.Email, req.Role); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"message": "user added"})
}

// HandleUpdateUser updates a user's role
func HandleUpdateUser(c *gin.Context) {
	email := c.Param("email")

	var req struct {
		Role string `json:"role" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "role is required"})
		return
	}

	userSvc := services.GetUserService()
	if err := userSvc.UpdateUserRole(email, req.Role); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "user updated"})
}

// HandleDeleteUser removes a user
func HandleDeleteUser(c *gin.Context) {
	email := c.Param("email")

	userSvc := services.GetUserService()
	if err := userSvc.RemoveUser(email); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "user removed"})
}
