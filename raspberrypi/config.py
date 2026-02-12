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


def optional_env(key: str, default: str = "") -> str:
    """Get an optional environment variable with a default value."""
    return os.environ.get(key, default)


def optional_env_int(key: str, default: int) -> int:
    """Get an optional integer environment variable with a default value."""
    value = os.environ.get(key)
    if not value:
        return default
    try:
        return int(value)
    except ValueError:
        print(f"WARNING: Environment variable {key} must be an integer, got: {value}. Using default: {default}", file=sys.stderr)
        return default


def optional_env_bool(key: str, default: bool) -> bool:
    """Get an optional boolean environment variable with a default value."""
    value = os.environ.get(key, "").lower()
    if not value:
        return default
    return value in ('true', '1', 'yes', 'on')


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

# Motion detection settings
MOTION_DETECTION_ENABLED = optional_env_bool('BIRDWATCH_MOTION_DETECTION_ENABLED', True)
MOTION_DETECTION_FPS = optional_env_int('BIRDWATCH_MOTION_DETECTION_FPS', 10)
MOTION_THRESHOLD = optional_env_int('BIRDWATCH_MOTION_THRESHOLD', 25)
MOTION_MIN_AREA = optional_env_int('BIRDWATCH_MOTION_MIN_AREA', 500)
MOTION_COOLDOWN = optional_env_int('BIRDWATCH_MOTION_COOLDOWN', 10)
MOTION_CAPTURE_DELAY = optional_env_int('BIRDWATCH_MOTION_CAPTURE_DELAY', 2)
MOTION_HISTORY = optional_env_int('BIRDWATCH_MOTION_HISTORY', 500)
MOTION_CAPTURE_COUNT = optional_env_int('BIRDWATCH_MOTION_CAPTURE_COUNT', 3)
MOTION_CAPTURE_INTERVAL = optional_env_int('BIRDWATCH_MOTION_CAPTURE_INTERVAL', 1)
SIGHTINGS_ENDPOINT = f"{SERVER_URL}/birdwatch/api/sightings"