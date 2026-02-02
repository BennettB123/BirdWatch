"""Camera manager for BirdWatch Raspberry Pi client.

Manages the Picamera2 hardware and provides frame access.
"""

import logging
from typing import Optional

import numpy as np
from picamera2 import Picamera2

import config

logger = logging.getLogger(__name__)


class CameraManager:
    """Manages the Raspberry Pi camera hardware."""

    def __init__(self):
        self._picam2: Optional[Picamera2] = None
        self._is_running = False

    @property
    def is_running(self) -> bool:
        """Check if camera is running."""
        return self._is_running and self._picam2 is not None

    @property
    def camera(self) -> Optional[Picamera2]:
        """Get the Picamera2 instance."""
        return self._picam2

    def start(self) -> bool:
        """Initialize and start the camera.

        Returns:
            True if camera started successfully, False otherwise.
        """
        if self.is_running:
            logger.debug("Camera already running")
            return True

        try:
            logger.info("Initializing camera")

            # Initialize camera
            self._picam2 = Picamera2()

            # Configure camera for video recording and frame capture
            video_config = self._picam2.create_video_configuration(
                main={
                    "size": (config.STREAM_WIDTH, config.STREAM_HEIGHT),
                    "format": "RGB888"
                },
                encode="main",
                controls={
                    "FrameRate": config.STREAM_FRAMERATE
                }
            )
            self._picam2.configure(video_config)

            # Start camera
            self._picam2.start()

            self._is_running = True
            logger.info("Camera started successfully")
            return True

        except Exception as e:
            logger.error(f"Failed to start camera: {e}")
            self._cleanup()
            return False

    def stop(self):
        """Stop and close the camera."""
        if not self.is_running:
            logger.debug("Camera not running")
            return

        try:
            logger.info("Stopping camera")

            if self._picam2:
                self._picam2.close()

            self._cleanup()
            logger.info("Camera stopped")

        except Exception as e:
            logger.error(f"Error stopping camera: {e}")
            self._cleanup()

    def capture_frame(self) -> Optional[np.ndarray]:
        """Capture a single frame from the camera.

        Returns:
            RGB frame as numpy array, or None if capture failed.
        """
        if not self.is_running or not self._picam2:
            logger.warning("Camera not running, cannot capture frame")
            return None

        try:
            return self._picam2.capture_array()
        except Exception as e:
            logger.error(f"Error capturing frame: {e}")
            return None

    def _cleanup(self):
        """Clean up camera resources."""
        self._picam2 = None
        self._is_running = False


# Global camera manager instance
_camera_manager: Optional[CameraManager] = None


def get_camera_manager() -> CameraManager:
    """Get the global CameraManager instance."""
    global _camera_manager
    if _camera_manager is None:
        _camera_manager = CameraManager()
    return _camera_manager
