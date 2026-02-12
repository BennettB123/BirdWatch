package middleware

import (
	"net/http"
	"strings"

	"birdwatch/config"

	"github.com/gin-contrib/sessions"
	"github.com/gin-gonic/gin"
)

func RequireAuth() gin.HandlerFunc {
	return func(c *gin.Context) {
		session := sessions.Default(c)
		email := session.Get("email")

		if email == nil {
			basePath := config.AppConfig.BasePath
			if strings.HasPrefix(c.Request.URL.Path, basePath+"/api/") {
				c.JSON(http.StatusUnauthorized, gin.H{"error": "session_expired"})
				c.Abort()
				return
			}
			c.Redirect(http.StatusFound, basePath+"/")
			c.Abort()
			return
		}

		// Store email in context for handlers
		c.Set("email", email.(string))
		c.Next()
	}
}

func RequirePiSecret() gin.HandlerFunc {
	return func(c *gin.Context) {
		secret := c.GetHeader("X-Pi-Secret")
		if secret == "" || secret != config.AppConfig.PiSecret {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
			c.Abort()
			return
		}
		c.Next()
	}
}

func RequireAdmin() gin.HandlerFunc {
	return func(c *gin.Context) {
		session := sessions.Default(c)
		role := session.Get("role")
		if role == nil || role.(string) != "admin" {
			c.JSON(http.StatusForbidden, gin.H{"error": "admin access required"})
			c.Abort()
			return
		}
		c.Next()
	}
}
