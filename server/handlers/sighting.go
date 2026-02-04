package handlers

import (
	"log"
	"net/http"
	"os"
	"strconv"
	"time"

	"birdwatch/config"
	"birdwatch/services"

	"github.com/gin-gonic/gin"
)

// HandleCreateSighting handles POST /api/sightings from the Pi
func HandleCreateSighting(c *gin.Context) {
	// Parse timestamp
	timestampStr := c.PostForm("timestamp")
	if timestampStr == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "timestamp is required"})
		return
	}

	timestamp, err := time.Parse(time.RFC3339, timestampStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid timestamp format, expected RFC3339"})
		return
	}

	// Get image file
	file, _, err := c.Request.FormFile("image")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "image is required"})
		return
	}
	defer file.Close()

	// Create sighting
	sightingService := services.GetSightingService()
	sighting, err := sightingService.CreateSighting(timestamp, file)
	if err != nil {
		log.Printf("Failed to create sighting: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create sighting"})
		return
	}

	// Send notification
	if notifier := services.GetNotificationService(); notifier != nil {
		cfg := config.AppConfig
		sightingsURL := cfg.BaseURL + cfg.BasePath + "/sightings"
		go notifier.SendNotification(services.NotificationOptions{
			Title:    "🐦 New Bird Sighting! 🐦",
			Message:  "A bird was detected at " + timestamp.Format("3:04 PM"),
			Priority: services.PriorityLow,
			URL:      sightingsURL,
			URLTitle: "📸 View Sightings 📸",
		})
	}

	c.JSON(http.StatusCreated, sighting)
}

// HandleGetSightings handles GET /api/sightings
func HandleGetSightings(c *gin.Context) {
	// Parse pagination parameters
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))

	// Clamp limit
	if limit <= 0 {
		limit = 20
	}
	if limit > 100 {
		limit = 100
	}
	if offset < 0 {
		offset = 0
	}

	sightingService := services.GetSightingService()

	// Get sightings
	sightings, err := sightingService.GetSightings(limit, offset)
	if err != nil {
		log.Printf("Failed to get sightings: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get sightings"})
		return
	}

	// Get total count
	total, err := sightingService.GetSightingCount()
	if err != nil {
		log.Printf("Failed to count sightings: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to count sightings"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"sightings": sightings,
		"total":     total,
		"limit":     limit,
		"offset":    offset,
	})
}

// HandleGetSightingImage handles GET /api/sightings/images/:filename
func HandleGetSightingImage(c *gin.Context) {
	filename := c.Param("filename")
	if filename == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "filename is required"})
		return
	}

	sightingService := services.GetSightingService()
	imagePath := sightingService.GetImagePath(filename)

	// Check if file exists
	if _, err := os.Stat(imagePath); os.IsNotExist(err) {
		c.JSON(http.StatusNotFound, gin.H{"error": "image not found"})
		return
	}

	c.File(imagePath)
}

// HandleDeleteSighting handles DELETE /api/sightings/:id
func HandleDeleteSighting(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid sighting ID"})
		return
	}

	sightingService := services.GetSightingService()
	if err := sightingService.DeleteSighting(id); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "sighting not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "sighting deleted"})
}
