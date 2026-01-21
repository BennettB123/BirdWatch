$RPI_USER = "bennett"
$RPI_HOST = "birdwatch"
$RPI_PHOTO_PATH = "/home/$RPI_USER/photo.jpg"
$LOCAL_PHOTO_PATH = "$env:USERPROFILE\Downloads\raspiphoto.jpg"

Write-Host "Taking picture on Raspberry Pi..." -ForegroundColor Cyan
ssh "$RPI_USER@$RPI_HOST" "rpicam-still -n -o $RPI_PHOTO_PATH"

if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to take picture!" -ForegroundColor Red
    exit 1
}

Write-Host "Downloading picture..." -ForegroundColor Cyan
scp "$RPI_USER@$RPI_HOST`:$RPI_PHOTO_PATH" $LOCAL_PHOTO_PATH

if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to download picture!" -ForegroundColor Red
    exit 1
}

Write-Host "Opening picture..." -ForegroundColor Cyan
Start-Process $LOCAL_PHOTO_PATH

Write-Host "Done!" -ForegroundColor Green