"""Configuration for BirdWatch Raspberry Pi client.

All environment variables are required.
"""

import os
import sys


def require_env(key: str) -> str:
    """Get a required environment variable or exit with error."""
    value = os.environ.get(key)
    if not value:
        print(f"ERROR: Required environment variable {key} is not set", file=sys.stderr)
        sys.exit(1)
    return value


def require_env_int(key: str) -> int:
    """Get a required integer environment variable or exit with error."""
    value = require_env(key)
    try:
        return int(value)
    except ValueError:
        print(f"ERROR: Environment variable {key} must be an integer, got: {value}", file=sys.stderr)
        sys.exit(1)


# Server/API configuration
SERVER_URL = require_env('BIRDWATCH_SERVER_URL')
RTMP_URL = require_env('BIRDWATCH_RTMP_URL')
STATUS_ENDPOINT = f"{SERVER_URL}/birdwatch/api/pi/status"

# Authentication
PI_SECRET = require_env('BIRDWATCH_PI_SECRET')
STREAM_KEY = require_env('BIRDWATCH_STREAM_KEY')

# Polling configuration
POLL_INTERVAL = require_env_int('BIRDWATCH_POLL_INTERVAL')

# Stream settings
STREAM_WIDTH = require_env_int('BIRDWATCH_STREAM_WIDTH')
STREAM_HEIGHT = require_env_int('BIRDWATCH_STREAM_HEIGHT')
STREAM_FRAMERATE = require_env_int('BIRDWATCH_STREAM_FRAMERATE')
STREAM_BITRATE = require_env('BIRDWATCH_STREAM_BITRATE')