"""Motion detection manager for BirdWatch Raspberry Pi client.

Manages motion detection using camera frames.
"""

import logging
import threading
import time
from datetime import datetime
from typing import Optional
from zoneinfo import ZoneInfo

import cv2
import numpy as np
import requests

import config
from camera_manager import get_camera_manager
from motion_detector import MotionDetector

logger = logging.getLogger(__name__)


class MotionDetectionManager:
    """Manages motion detection from camera frames."""

    def __init__(self):
        self._camera_manager = get_camera_manager()
        self._motion_detector: Optional[MotionDetector] = None
        self._motion_thread: Optional[threading.Thread] = None
        self._stop_event: Optional[threading.Event] = None
        self._is_running = False

    @property
    def is_running(self) -> bool:
        """Check if motion detection is running."""
        return self._is_running

    def start(self) -> bool:
        """Start motion detection.

        Returns:
            True if motion detection started successfully, False otherwise.
        """
        if self.is_running:
            logger.debug("Motion detection already running")
            return True

        if not self._camera_manager.is_running:
            logger.error("Camera not running, cannot start motion detection")
            return False

        try:
            logger.info("Starting motion detection")

            self._motion_detector = MotionDetector()
            self._stop_event = threading.Event()
            self._motion_thread = threading.Thread(
                target=self._detection_loop,
                daemon=True,
                name="MotionDetection"
            )
            self._motion_thread.start()

            self._is_running = True
            logger.info("Motion detection started successfully")
            return True

        except Exception as e:
            logger.error(f"Failed to start motion detection: {e}")
            self._cleanup()
            return False

    def stop(self):
        """Stop motion detection."""
        if not self.is_running:
            logger.debug("Motion detection not running")
            return

        try:
            logger.info("Stopping motion detection")

            if self._stop_event:
                self._stop_event.set()

            if self._motion_thread:
                self._motion_thread.join(timeout=5)

            self._cleanup()
            logger.info("Motion detection stopped")

        except Exception as e:
            logger.error(f"Error stopping motion detection: {e}")
            self._cleanup()

    def _detection_loop(self):
        """Background thread that processes frames for motion detection."""
        logger.debug("Motion detection loop started")
        logger.info(f"Motion detection running at {config.MOTION_DETECTION_FPS} FPS")

        target_interval = 1.0 / config.MOTION_DETECTION_FPS

        while not self._stop_event.is_set():
            try:
                start_time = time.time()

                # Check if camera is still running
                if not self._camera_manager.is_running:
                    logger.warning("Camera stopped, ending motion detection")
                    break

                # Capture a frame from the camera
                frame = self._camera_manager.capture_frame()
                if frame is None:
                    logger.warning("Failed to capture frame for motion detection")
                    time.sleep(1)
                    continue

                # Process frame for motion detection
                motion_detected = self._motion_detector.process_frame(frame)

                if motion_detected:
                    # Spawn thread to wait and then capture screenshot
                    threading.Thread(
                        target=self._delayed_capture_and_send,
                        daemon=True,
                        name="DelayedCapture"
                    ).start()

                # Calculate how long processing took and adjust sleep time
                elapsed = time.time() - start_time
                sleep_time = max(0, target_interval - elapsed)
                time.sleep(sleep_time)

            except Exception as e:
                logger.error(f"Error in motion detection loop: {e}")
                time.sleep(1)

        self._is_running = False
        logger.debug("Motion detection loop stopped")

    def _delayed_capture_and_send(self):
        """Wait for motion to settle, then capture and send screenshot."""
        try:
            # Wait for bird to land/settle
            logger.debug(f"Waiting {config.MOTION_CAPTURE_DELAY}s before capturing screenshot")
            time.sleep(config.MOTION_CAPTURE_DELAY)

            # Capture a fresh frame AFTER the delay
            frame = self._camera_manager.capture_frame()
            if frame is not None:
                logger.debug("Capturing screenshot after delay")
                self._send_motion_event(frame)
            else:
                logger.warning("Failed to capture delayed screenshot")

        except Exception as e:
            logger.error(f"Error in delayed capture: {e}")

    def _send_motion_event(self, frame: np.ndarray):
        """Send motion detection event to server.

        Args:
            frame: BGR frame to send as screenshot
        """
        try:
            timestamp = datetime.now(ZoneInfo("America/New_York")).isoformat()

            # Encode frame as JPEG (already BGR format for OpenCV)
            _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 80])

            # Prepare multipart form data
            files = {
                'image': ('sighting.jpg', buffer.tobytes(), 'image/jpeg')
            }
            data = {
                'timestamp': timestamp
            }

            # Send POST request
            response = requests.post(
                config.SIGHTINGS_ENDPOINT,
                headers={'X-Pi-Secret': config.PI_SECRET},
                files=files,
                data=data,
                timeout=10
            )

            if response.status_code == 201:
                logger.info(f"Sighting sent successfully at {timestamp}")
            else:
                logger.warning(f"Sighting upload failed with status {response.status_code}: {response.text}")

        except requests.exceptions.Timeout:
            logger.warning("Sighting request timed out")
        except requests.exceptions.ConnectionError:
            logger.warning("Could not connect to server for sighting")
        except Exception as e:
            logger.error(f"Error sending sighting: {e}")

    def reset_detector(self):
        """Reset motion detector background model.

        Call this when streaming state changes to re-learn the background
        with adjusted camera settings.
        """
        if self._motion_detector:
            self._motion_detector.reset()
            logger.info("Motion detector reset due to streaming state change")

    def _cleanup(self):
        """Clean up motion detection resources."""
        self._motion_detector = None
        self._motion_thread = None
        self._stop_event = None
        self._is_running = False


# Global motion detection manager instance
_motion_manager: Optional[MotionDetectionManager] = None


def get_motion_manager() -> MotionDetectionManager:
    """Get the global MotionDetectionManager instance."""
    global _motion_manager
    if _motion_manager is None:
        _motion_manager = MotionDetectionManager()
    return _motion_manager
