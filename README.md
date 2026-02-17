# BirdWatch

A live-streaming system built with a Raspberry Pi and a Go web server. The Raspberry Pi runs a camera continuously, streaming video over RTMP to the server only when authenticated users are actively viewing the web app. The server transcodes the RTMP stream to HLS for browser playback and serves a web application with Google OAuth login. The Pi also runs motion detection in the background using OpenCV, automatically capturing and uploading photos of bird sightings to the server.

# Features

- **On-demand live stream** - The Raspberry Pi only streams to the server when users are actively watching. The browser sends heartbeats to the server, and the Pi polls the server to check if there are active viewers.
- **Motion detection sightings** - The Pi uses OpenCV to detect motion near the bird feeder. When motion is detected, the Pi captures photos and uploads them to the server. Users can browse sightings in a gallery on the web page.
- **Configurable stream downtime** - A downtime window can be configured (e.g., 19:00 - 06:00) to disable the live stream during nighttime hours.
- **Admin panel** - Admins can manage authorized users (add, edit roles, delete), and view a searchable login history with timestamps, emails, and IP addresses.
- **Push notifications** - Optional Pushover integration sends push notifications when new bird sightings are detected.

# Deployment

## Raspberry Pi

BirdWatch requires a Raspberry Pi with a Raspberry Pi Camera Module. The code is written for the **Camera Module 3** using the Picamera2 library, which supports features like configurable autofocus and manual focus position. Code adjustments may be required for different cameras.

1. Install [FFmpeg](https://ffmpeg.org/) on the Raspberry Pi
1. Clone the repository to the Pi.
1. Install Python dependencies: `pip install -r raspberrypi/requirements.txt`
1. Copy `raspberrypi/.env.example` to `raspberrypi/.env` and fill in the values. The `BIRDWATCH_PI_SECRET` and `BIRDWATCH_STREAM_KEY` must match the values configured on the server.
1. Run the client with `python3 raspberrypi/birdwatch_client.py`.

## Server

The server is a Go application using the Gin web framework. It embeds an RTMP server to receive the Pi's stream and uses FFmpeg to remux it into HLS for browser playback. Data is stored in SQLite (bird sighting events & login attempts)

1. Install [FFmpeg](https://ffmpeg.org/) on the server.
1. Copy `server/.env.example` to `server/.env` and fill in the values.
1. Copy `server/allowed_emails.csv.example` to `server/allowed_emails.csv` and add authenticated users (later, admin users can add/remove users through the web page).
1. Set up Google OAuth credentials and save them to `google_auth.json` (path configurable via `BIRDWATCH_GOOGLE_AUTH_FILE`). This file should be the JSON format that is available for export in the Google Console.
1. Build and run the Go binary.

### Authorization

Access is controlled via an allowlist file (`allowed_emails.csv`). Each line contains an email address and a role, separated by a comma:

```
user@example.com,user
admin@example.com,admin
```

- **user** - Can view the live stream and browse sightings.
- **admin** - Has all user permissions plus access to the admin panel for managing users, deleting sightings, and viewing login history.

Changes to the allowlist file take effect immediately without restarting the server. An example file (`allowed_emails.csv.example`) is included as a template.

# Environment Variables

Below are environment variables that may need additional explanation. Refer to `.env.example` in both `server/` and `raspberrypi/` for the full list of available variables and their defaults.

### Shared Secrets

| Variable | Location | Description |
|---|---|---|
| `BIRDWATCH_PI_SECRET` | Server + Pi | A shared secret used to authenticate the Pi's API requests to the server. The Pi sends this in an HTTP header when polling for viewer status and uploading sightings. Must be the same value on both sides. |
| `BIRDWATCH_STREAM_KEY` | Server + Pi | The RTMP stream key used to authenticate the Pi's video stream. The server validates this key before accepting the stream. Must be the same value on both sides. |

### Notifications (Server)

| Variable | Description |
|---|---|
| `BIRDWATCH_PUSHOVER_API_TOKEN` | Pushover API token for the application. If not set, notifications are disabled. |
| `BIRDWATCH_PUSHOVER_USER_KEY` | Pushover user key that receives motion detection notifications. |
| `BIRDWATCH_PUSHOVER_ADMIN_USER_KEY` | Separate Pushover user key for admin-only notifications. |

### Motion Detection (Raspberry Pi)

| Variable | Default | Description |
|---|---|---|
| `BIRDWATCH_MOTION_DETECTION_ENABLED` | `true` | Enable or disable motion detection. |
| `BIRDWATCH_MOTION_DETECTION_FPS` | `10` | Frames per second to analyze for motion. |
| `BIRDWATCH_MOTION_THRESHOLD` | `25` | MOG2 variance threshold. Lower values make detection more sensitive to movement. |
| `BIRDWATCH_MOTION_MIN_AREA` | `500` | Minimum area (in pixels) to qualify as motion. Filters out small movements like leaves or bugs. |
| `BIRDWATCH_MOTION_HISTORY` | `500` | Number of frames used to build the background model. Motion is ignored during this initial learning phase. |
| `BIRDWATCH_MOTION_COOLDOWN` | `20` | Seconds to wait after a detection before allowing another. Prevents duplicate sightings. |
| `BIRDWATCH_MOTION_CAPTURE_DELAY` | `2` | Seconds to wait after detecting motion before capturing images. Gives the bird time to settle. |
| `BIRDWATCH_MOTION_CAPTURE_COUNT` | `3` | Number of images to capture per sighting. |
| `BIRDWATCH_MOTION_CAPTURE_INTERVAL` | `1` | Seconds between each image capture in a burst. |
