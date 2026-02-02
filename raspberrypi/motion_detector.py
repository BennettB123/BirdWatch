"""Motion detection for BirdWatch Raspberry Pi client.

Uses OpenCV background subtraction to detect motion in camera frames.
"""

import logging
import time

import cv2
import numpy as np

import config

logger = logging.getLogger(__name__)


class MotionDetector:
    """Detects motion in camera frames using background subtraction."""

    def __init__(self):
        # Background subtractor for motion detection
        self._bg_subtractor = cv2.createBackgroundSubtractorMOG2(
            history=config.MOTION_HISTORY,
            varThreshold=config.MOTION_THRESHOLD,
            detectShadows=False
        )

        self._last_detection_time = 0
        self._frame_count = 0
        self._detection_count = 0
        self._is_learning = True  # True until we've processed MOTION_HISTORY frames

    def process_frame(self, frame: np.ndarray) -> bool:
        """Process a frame and detect motion.

        Args:
            frame: BGR frame from camera (picamera2 returns BGR)

        Returns:
            True if motion was detected, False otherwise
        """
        self._frame_count += 1

        # Convert to grayscale for processing
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

        # Apply Gaussian blur to reduce noise
        blurred = cv2.GaussianBlur(gray, (21, 21), 0)

        # Apply background subtraction
        fg_mask = self._bg_subtractor.apply(blurred)

        # Check if we're still in learning phase
        if self._is_learning:
            if self._frame_count >= config.MOTION_HISTORY:
                self._is_learning = False
                logger.info(f"Motion detector learning complete ({config.MOTION_HISTORY} frames processed)")
            return False

        # Check cooldown period
        current_time = time.time()
        if current_time - self._last_detection_time < config.MOTION_COOLDOWN:
            return False

        # Threshold to get binary image
        _, thresh = cv2.threshold(fg_mask, 244, 255, cv2.THRESH_BINARY)

        # Find contours
        contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        # Check if any contour is large enough
        motion_detected = False
        for contour in contours:
            if cv2.contourArea(contour) >= config.MOTION_MIN_AREA:
                motion_detected = True
                break

        if motion_detected:
            self._detection_count += 1
            self._last_detection_time = current_time
            logger.info(f"Motion detected! (event #{self._detection_count})")
            return True

        return False

    def reset(self):
        """Reset the background model."""
        self._bg_subtractor = cv2.createBackgroundSubtractorMOG2(
            history=config.MOTION_HISTORY,
            varThreshold=config.MOTION_THRESHOLD,
            detectShadows=False
        )
        self._frame_count = 0
        self._is_learning = True
        logger.debug("Motion detector reset")
