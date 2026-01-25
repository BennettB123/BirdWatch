"""Stream manager for BirdWatch Raspberry Pi client.

Handles starting and stopping the video stream using rpicam-vid and ffmpeg.
"""

import logging
import subprocess
import os
import signal
import time
from typing import Optional

import config

logger = logging.getLogger(__name__)


class StreamManager:
    """Manages the video stream from the Raspberry Pi camera."""

    def __init__(self):
        self._process: Optional[subprocess.Popen] = None
        self._is_streaming = False

    @property
    def is_streaming(self) -> bool:
        """Check if stream is currently active."""
        if self._process is None:
            return False

        # Check if process is still running
        poll_result = self._process.poll()
        if poll_result is not None:
            # Process has terminated
            self._is_streaming = False
            self._process = None
            return False

        return self._is_streaming

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

            # Build rpicam-vid command piped to ffmpeg.
            # rpicam-vid outputs h264 stream, ffmpeg wraps it in FLV for RTMP.
            cmd = (
                f"rpicam-vid -t 0 --inline -n "
                f"--width {config.STREAM_WIDTH} "
                f"--height {config.STREAM_HEIGHT} "
                f"--framerate {config.STREAM_FRAMERATE} "
                f"--bitrate {config.STREAM_BITRATE} "
                f"--flush "  # Flush output buffers immediately
                f"-o - | "
                f"ffmpeg -fflags nobuffer -flags low_delay "
                f"-i - "
                f"-c:v copy "
                f"-an "
                f"-f flv {rtmp_url}"
            )

            logger.info(f"Starting stream to {config.RTMP_URL}")
            logger.debug(f"Stream command: {cmd}")

            # Use process group so we can kill all child processes
            self._process = subprocess.Popen(
                cmd,
                shell=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                preexec_fn=os.setsid  # Create new process group
            )

            # Give it a moment to start
            time.sleep(2)

            # Check if process started successfully
            if self._process.poll() is not None:
                stderr = self._process.stderr.read().decode() if self._process.stderr else ""
                logger.error(f"Stream process exited immediately: {stderr}")
                self._process = None
                return False

            self._is_streaming = True
            logger.info("Stream started successfully")
            return True

        except Exception as e:
            logger.error(f"Failed to start stream: {e}")
            self._process = None
            return False

    def stop(self) -> bool:
        """Stop the video stream.

        Returns:
            True if stream stopped successfully, False otherwise.
        """
        if not self._is_streaming and self._process is None:
            logger.debug("Stream not running")
            return True

        try:
            if self._process:
                logger.info("Stopping stream...")

                # Kill the entire process group (includes shell, rpicam-vid, ffmpeg)
                try:
                    pgid = os.getpgid(self._process.pid)
                    os.killpg(pgid, signal.SIGTERM)
                except (ProcessLookupError, OSError) as e:
                    logger.debug(f"Process group already gone: {e}")

                # Wait for process to terminate
                try:
                    self._process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    logger.warning("Stream process didn't terminate, killing...")
                    try:
                        pgid = os.getpgid(self._process.pid)
                        os.killpg(pgid, signal.SIGKILL)
                    except (ProcessLookupError, OSError):
                        pass
                    try:
                        self._process.wait(timeout=2)
                    except subprocess.TimeoutExpired:
                        pass

                self._process = None

            # Also kill any orphaned processes just in case
            self._kill_orphaned_processes()

            self._is_streaming = False
            logger.info("Stream stopped")
            return True

        except Exception as e:
            logger.error(f"Error stopping stream: {e}")
            # Force cleanup
            self._process = None
            self._is_streaming = False
            self._kill_orphaned_processes()
            return False

    def _kill_orphaned_processes(self):
        """Kill any orphaned rpicam-vid or ffmpeg processes."""
        try:
            subprocess.run(['pkill', '-f', 'rpicam-vid'], capture_output=True)
            subprocess.run(['pkill', '-f', 'ffmpeg.*flv'], capture_output=True)
        except Exception as e:
            logger.debug(f"Error killing orphaned processes: {e}")

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
