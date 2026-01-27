"""Stream manager for BirdWatch Raspberry Pi client.

Handles starting and stopping the video stream using picamera2.
"""

import logging
import time
from typing import Optional

from picamera2 import Picamera2
from picamera2.encoders import H264Encoder
from picamera2.outputs import FfmpegOutput

import config

logger = logging.getLogger(__name__)


class StreamManager:
    """Manages the video stream from the Raspberry Pi camera."""

    def __init__(self):
        self._picam2: Optional[Picamera2] = None
        self._encoder: Optional[H264Encoder] = None
        self._output: Optional[FfmpegOutput] = None
        self._is_streaming = False

    @property
    def is_streaming(self) -> bool:
        """Check if stream is currently active."""
        return self._is_streaming and self._picam2 is not None

    def start(self) -> bool:
        """Start the video stream.

        Returns:
            True if stream started successfully, False otherwise.
        """
        if self.is_streaming:
            logger.debug("Stream already running")
            return True

        try:
            rtmp_url = f"{config.RTMP_URL}/live/{config.STREAM_KEY}"

            logger.info(f"Starting stream to {config.RTMP_URL}")
            logger.debug(f"Stream configuration: {config.STREAM_WIDTH}x{config.STREAM_HEIGHT} @ {config.STREAM_FRAMERATE}fps, {config.STREAM_BITRATE}")

            # Initialize camera
            self._picam2 = Picamera2()

            # Configure camera for video recording
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

            bitrate = parse_bitrate(config.STREAM_BITRATE.lower())

            self._encoder = H264Encoder(bitrate=bitrate)

            # Create FFmpeg output for RTMP streaming
            self._output = FfmpegOutput(
                output_filename=f"-fflags nobuffer -flags low_delay -f flv {rtmp_url}",
                audio=False
            )

            self._picam2.start_recording(self._encoder, self._output)

            self._is_streaming = True
            logger.info("Stream started successfully")
            return True

        except Exception as e:
            logger.error(f"Failed to start stream: {e}")
            self._cleanup()
            return False

    def stop(self) -> bool:
        """Stop the video stream.

        Returns:
            True if stream stopped successfully, False otherwise.
        """
        if not self._is_streaming:
            logger.debug("Stream not running")
            return True

        try:
            logger.info("Stopping stream...")

            if self._picam2:
                # Stop recording
                self._picam2.stop_recording()
                # Close camera
                self._picam2.close()

            self._cleanup()

            self._is_streaming = False
            logger.info("Stream stopped")
            return True

        except Exception as e:
            logger.error(f"Error stopping stream: {e}")
            self._cleanup()
            self._is_streaming = False
            return False

    def _cleanup(self):
        """Clean up camera resources."""
        self._picam2 = None
        self._encoder = None
        self._output = None

    def restart(self) -> bool:
        """Restart the video stream.

        Returns:
            True if stream restarted successfully, False otherwise.
        """
        logger.info("Restarting stream...")
        self.stop()
        time.sleep(2)
        return self.start()


# Global stream manager instance
_stream_manager: Optional[StreamManager] = None


def get_stream_manager() -> StreamManager:
    """Get the global StreamManager instance."""
    global _stream_manager
    if _stream_manager is None:
        _stream_manager = StreamManager()
    return _stream_manager


def parse_bitrate(bitrate_str):
    if bitrate_str.endswith('k'):
        return int(bitrate_str[:-1]) * 1000
    elif bitrate_str.endswith('m'):
        return int(bitrate_str[:-1]) * 1000000
    else:
        return int(bitrate_str)