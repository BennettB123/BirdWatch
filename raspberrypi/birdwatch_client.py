#!/usr/bin/env python3
"""BirdWatch Raspberry Pi client.

This service polls the BirdWatch server to check if any users are viewing
the stream. When users are present, it starts streaming from the Pi camera.
When no users are present, it stops streaming.
"""

import logging
import signal
import sys
import time
from typing import Optional

import requests

import config
from stream_manager import get_stream_manager

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger('birdwatch')

# Global flag for graceful shutdown
_running = True


def signal_handler(signum, frame):
    """Handle shutdown signals."""
    global _running
    logger.info(f"Received signal {signum}, shutting down...")
    _running = False


def check_server_status() -> Optional[bool]:
    """Check the server for stream status.

    Returns:
        True if streaming should be active (users are watching),
        False if no users are watching,
        None if the request failed.
    """
    try:
        response = requests.get(
            config.STATUS_ENDPOINT,
            headers={'X-Pi-Secret': config.PI_SECRET},
            timeout=10
        )

        if response.status_code == 200:
            data = response.json()
            should_stream = data.get('stream', False)
            user_count = data.get('user_count', 0)
            logger.debug(f"Server status: stream={should_stream}, user_count={user_count}")
            return should_stream
        elif response.status_code == 401:
            logger.error("Unauthorized - check PI_SECRET configuration")
            return None
        else:
            logger.warning(f"Unexpected status code: {response.status_code}")
            return None

    except requests.exceptions.Timeout:
        logger.warning("Server request timed out")
        return None
    except requests.exceptions.ConnectionError:
        logger.warning("Could not connect to server")
        return None
    except Exception as e:
        logger.error(f"Error checking server status: {e}")
        return None


def main():
    """Main entry point."""
    global _running

    # Set up signal handlers
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    logger.info("BirdWatch Pi client starting...")
    logger.info(f"Server URL: {config.SERVER_URL}")
    logger.info(f"RTMP URL: {config.RTMP_URL}")
    logger.info(f"Poll interval: {config.POLL_INTERVAL}s")

    stream_manager = get_stream_manager()
    consecutive_failures = 0
    max_failures = 5  # Stop streaming after 5 consecutive failures

    while _running:
        try:
            should_stream = check_server_status()

            if should_stream is None:
                # Request failed
                consecutive_failures += 1
                if consecutive_failures >= max_failures and stream_manager.is_streaming:
                    logger.warning(f"{consecutive_failures} consecutive failures, stopping stream")
                    stream_manager.stop()
            else:
                consecutive_failures = 0

                if should_stream:
                    if not stream_manager.is_streaming:
                        logger.info("Users are watching, starting stream...")
                        if not stream_manager.start():
                            logger.error("Failed to start stream, will retry...")
                else:
                    if stream_manager.is_streaming:
                        logger.info("No users watching, stopping stream...")
                        stream_manager.stop()

            # Wait for next poll
            for _ in range(config.POLL_INTERVAL):
                if not _running:
                    break
                time.sleep(1)

        except Exception as e:
            logger.error(f"Unexpected error in main loop: {e}")
            time.sleep(config.POLL_INTERVAL)

    # Cleanup
    logger.info("Shutting down...")
    if stream_manager.is_streaming:
        stream_manager.stop()
    logger.info("BirdWatch Pi client stopped")


if __name__ == '__main__':
    main()
