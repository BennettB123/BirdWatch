package handlers

import (
	"io"
	"log"
	"net/http"
	"os"
	"strconv"
	"time"

	"birdwatch/config"
	"birdwatch/services"

	"github.com/gin-gonic/gin"
)

type updateSightingFavoriteRequest struct {
	Favorite bool `json:"favorite"`
}

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

	// Collect all image files (image, image2, image3, ... up to image10)
	var images []io.Reader
	var closers []io.Closer

	// Try to get "image" first
	if file, _, err := c.Request.FormFile("image"); err == nil {
		images = append(images, file)
		closers = append(closers, file)
	}

	// Try to get image2 through image10
	for i := 2; i <= 10; i++ {
		fieldName := "image" + strconv.Itoa(i)
		if file, _, err := c.Request.FormFile(fieldName); err == nil {
			images = append(images, file)
			closers = append(closers, file)
		}
	}

	// Ensure cleanup
	defer func() {
		for _, closer := range closers {
			closer.Close()
		}
	}()

	// At least one image required
	if len(images) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "at least one image is required"})
		return
	}

	// Create sighting
	sightingService := services.GetSightingService()
	sighting, err := sightingService.CreateSighting(timestamp, images)
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
			Priority: services.PriorityNormal,
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

	filters, ok := parseSightingFilters(c)
	if !ok {
		return
	}

	sightingService := services.GetSightingService()

	// Get sightings
	sightings, err := sightingService.GetSightings(limit, offset, filters)
	if err != nil {
		log.Printf("Failed to get sightings: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get sightings"})
		return
	}

	// Get total count
	total, err := sightingService.GetSightingCount(filters)
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

func parseSightingFilters(c *gin.Context) (services.SightingFilters, bool) {
	var filters services.SightingFilters

	favoritesValue := c.Query("favorites")
	if favoritesValue == "true" || favoritesValue == "1" {
		filters.FavoritesOnly = true
	} else if favoritesValue != "" && favoritesValue != "false" && favoritesValue != "0" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "favorites must be true or false"})
		return filters, false
	}

	startDateStr := c.Query("start_date")
	endDateStr := c.Query("end_date")
	if (startDateStr == "") != (endDateStr == "") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "start_date and end_date must be provided together"})
		return filters, false
	}

	if startDateStr != "" {
		startDate, err := time.Parse("2006-01-02", startDateStr)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "start_date must use YYYY-MM-DD format"})
			return filters, false
		}
		endDate, err := time.Parse("2006-01-02", endDateStr)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "end_date must use YYYY-MM-DD format"})
			return filters, false
		}
		if endDate.Before(startDate) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "end_date must be on or after start_date"})
			return filters, false
		}
		filters.StartDate = &startDate
		filters.EndDate = &endDate
	}

	return filters, true
}

// HandleUpdateSightingFavorite handles PATCH /api/sightings/:id/favorite
func HandleUpdateSightingFavorite(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid sighting ID"})
		return
	}

	var request updateSightingFavoriteRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "favorite is required"})
		return
	}

	sightingService := services.GetSightingService()
	sighting, err := sightingService.SetFavorite(id, request.Favorite)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "sighting not found"})
		return
	}

	c.JSON(http.StatusOK, sighting)
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
