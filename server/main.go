package main

import (
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	"birdwatch/config"
	"birdwatch/handlers"
	"birdwatch/middleware"
	"birdwatch/services"

	"github.com/gin-contrib/sessions"
	"github.com/gin-contrib/sessions/cookie"
	"github.com/gin-gonic/gin"
)

func main() {
	// Load configuration
	cfg := config.Load()

	log.Printf("Starting BirdWatch server...")
	log.Printf("Base path: %s", cfg.BasePath)
	log.Printf("HLS directory: %s", cfg.HLSDir)
	log.Printf("HLS segment duration: %d seconds", cfg.HLSSegmentDuration)
	log.Printf("HLS list size: %d segments (%d seconds buffer)", cfg.HLSListSize, cfg.HLSSegmentDuration*cfg.HLSListSize)
	log.Printf("RTMP port: %s", cfg.RTMPPort)
	log.Printf("HTTP port: %s", cfg.Port)
	log.Printf("Allowed emails file: %s (%d emails loaded)", cfg.AllowedEmailsFile, cfg.GetAllowedEmailCount())

	// Ensure HLS directory exists
	if err := os.MkdirAll(cfg.HLSDir, 0755); err != nil {
		log.Fatalf("Failed to create HLS directory: %v", err)
	}

	// Initialize services
	sessionMgr := services.GetSessionManager()
	rtmpServer := services.GetRTMPServer(cfg.StreamKey, cfg.HLSDir)

	// Start RTMP server
	if err := rtmpServer.Start(cfg.RTMPPort); err != nil {
		log.Fatalf("Failed to start RTMP server: %v", err)
	}

	// Set up Gin
	gin.SetMode(gin.ReleaseMode)
	router := gin.Default()

	// Session middleware with encrypted cookies
	store := cookie.NewStore([]byte(cfg.SessionSecret))
	store.Options(sessions.Options{
		MaxAge:   86400, // 24 hours
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteLaxMode,
		Path:     cfg.BasePath,
	})
	router.Use(sessions.Sessions("birdwatch_session", store))

	// Routes under base path
	base := router.Group(cfg.BasePath)
	{
		// Public routes
		base.Static("/static", "./static")
		base.GET("/", func(c *gin.Context) {
			c.File("./static/index.html")
		})

		// Auth routes (public)
		auth := base.Group("/auth")
		{
			auth.GET("/login", handlers.HandleLogin)
			auth.GET("/callback", handlers.HandleCallback)
			auth.GET("/logout", handlers.HandleLogout)
		}

		// Pi status endpoint (requires Pi secret)
		pi := base.Group("/api/pi")
		pi.Use(middleware.RequirePiSecret())
		{
			pi.GET("/status", handlers.HandlePiStatus)
		}

		// Protected routes (require authentication)
		protected := base.Group("")
		protected.Use(middleware.RequireAuth())
		{
			// Player page
			protected.GET("/player", func(c *gin.Context) {
				c.File("./static/player.html")
			})

			// User info
			protected.GET("/api/user", handlers.HandleUser)
			protected.POST("/api/user/heartbeat", handlers.HandleHeartbeat)

			// Stream endpoints
			stream := protected.Group("/api/stream")
			{
				stream.GET("/playlist.m3u8", handlers.HandlePlaylist)
				stream.GET("/:segment", handlers.HandleSegment)
			}

			// Stream status (for debugging)
			protected.GET("/api/stream/status", handlers.HandleStreamStatus)
		}
	}

	// Graceful shutdown
	go func() {
		sigChan := make(chan os.Signal, 1)
		signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
		<-sigChan

		log.Println("Shutting down...")
		rtmpServer.Stop()
		sessionMgr.Stop()
		os.Exit(0)
	}()

	// Start HTTP server
	addr := ":" + cfg.Port
	log.Printf("HTTP server listening on %s", addr)
	if err := router.Run(addr); err != nil {
		log.Fatalf("Failed to start HTTP server: %v", err)
	}
}
