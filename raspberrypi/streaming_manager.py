"""Streaming manager for BirdWatch Raspberry Pi client.

Manages RTMP streaming using the camera.
"""

import logging
from typing import Optional

from picamera2.encoders import H264Encoder
from picamera2.outputs import FfmpegOutput

import config
from camera_manager import get_camera_manager

logger = logging.getLogger(__name__)


class StreamingManager:
    """Manages RTMP streaming from the camera."""

    def __init__(self):
        self._encoder: Optional[H264Encoder] = None
        self._output: Optional[FfmpegOutput] = None
        self._is_streaming = False
        self._camera_manager = get_camera_manager()

    @property
    def is_streaming(self) -> bool:
        """Check if RTMP streaming is active."""
        return self._is_streaming

    def start(self) -> bool:
        """Start RTMP streaming.

        Returns:
            True if streaming started successfully, False otherwise.
        """
        if self.is_streaming:
            logger.debug("RTMP streaming already active")
            return True

        if not self._camera_manager.is_running:
            logger.error("Camera not running, cannot start RTMP streaming")
            return False

        camera = self._camera_manager.camera
        if not camera:
            logger.error("Camera instance not available")
            return False

        try:
            rtmp_url = f"{config.RTMP_URL}/live/{config.STREAM_KEY}"

            logger.info(f"Starting RTMP stream to {config.RTMP_URL}")
            logger.debug(f"Stream configuration: {config.STREAM_WIDTH}x{config.STREAM_HEIGHT} @ {config.STREAM_FRAMERATE}fps, {config.STREAM_BITRATE}")

            # Parse bitrate
            bitrate = self._parse_bitrate(config.STREAM_BITRATE.lower())

            # Create encoder
            self._encoder = H264Encoder(bitrate=bitrate)

            # Create FFmpeg output for RTMP streaming
            self._output = FfmpegOutput(
                output_filename=f"-fflags nobuffer -flags low_delay -f flv {rtmp_url}",
                audio=False
            )

            # Start encoder
            camera.start_encoder(self._encoder, self._output)

            self._is_streaming = True
            logger.info("RTMP streaming started successfully")
            return True

        except Exception as e:
            logger.error(f"Failed to start RTMP streaming: {e}")
            self._cleanup()
            return False

    def stop(self) -> bool:
        """Stop RTMP streaming.

        Returns:
            True if streaming stopped successfully, False otherwise.
        """
        if not self.is_streaming:
            logger.debug("RTMP streaming not active")
            return True

        try:
            logger.info("Stopping RTMP streaming")

            camera = self._camera_manager.camera
            if camera and self._encoder:
                camera.stop_encoder(self._encoder)

            self._cleanup()

            self._is_streaming = False
            logger.info("RTMP streaming stopped")
            return True

        except Exception as e:
            logger.error(f"Error stopping RTMP streaming: {e}")
            self._cleanup()
            self._is_streaming = False
            return False

    def _cleanup(self):
        """Clean up streaming resources."""
        self._encoder = None
        self._output = None

    @staticmethod
    def _parse_bitrate(bitrate_str: str) -> int:
        """Parse bitrate string (e.g., '2m', '500k') to integer."""
        if bitrate_str.endswith('k'):
            return int(bitrate_str[:-1]) * 1000
        elif bitrate_str.endswith('m'):
            return int(bitrate_str[:-1]) * 1000000
        else:
            return int(bitrate_str)


# Global streaming manager instance
_streaming_manager: Optional[StreamingManager] = None


def get_streaming_manager() -> StreamingManager:
    """Get the global StreamingManager instance."""
    global _streaming_manager
    if _streaming_manager is None:
        _streaming_manager = StreamingManager()
    return _streaming_manager
