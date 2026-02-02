package services

import (
	"birdwatch/config"
	"fmt"
	"io"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"sync"
)

type Transcoder struct {
	mu        sync.Mutex
	cmd       *exec.Cmd
	stdin     io.WriteCloser
	hlsDir    string
	isRunning bool
}

var (
	transcoder     *Transcoder
	transcoderOnce sync.Once
)

func GetTranscoder(hlsDir string) *Transcoder {
	transcoderOnce.Do(func() {
		transcoder = &Transcoder{
			hlsDir: hlsDir,
		}
	})
	return transcoder
}

func (t *Transcoder) Start() error {
	t.mu.Lock()
	defer t.mu.Unlock()

	if t.isRunning {
		return nil
	}

	// Ensure HLS directory exists
	if err := os.MkdirAll(t.hlsDir, 0755); err != nil {
		return fmt.Errorf("failed to create HLS directory: %w", err)
	}

	playlistPath := filepath.Join(t.hlsDir, "playlist.m3u8")
	segmentPattern := filepath.Join(t.hlsDir, "segment_%03d.ts")

	// FFmpeg command to remux piped FLV input to HLS (no re-encoding)
	segmentDuration := strconv.Itoa(config.AppConfig.HLSSegmentDuration)
	listSize := strconv.Itoa(config.AppConfig.HLSListSize)

	args := []string{
		"-f", "flv", // Input format is FLV from RTMP
		"-fflags", "nobuffer", // Reduce input buffering
		"-i", "pipe:0",
		"-c:v", "copy", // Copy video codec (already h264 from Pi)
		"-an", // No audio
		"-f", "hls",
		"-hls_time", segmentDuration,
		"-hls_list_size", listSize,
		"-hls_flags", "delete_segments+append_list",
		"-hls_segment_filename", segmentPattern,
		playlistPath,
	}

	t.cmd = exec.Command("ffmpeg", args...)

	var err error
	t.stdin, err = t.cmd.StdinPipe()
	if err != nil {
		return fmt.Errorf("failed to create stdin pipe: %w", err)
	}

	// Capture stderr for debugging
	t.cmd.Stderr = &ffmpegLogger{prefix: "[ffmpeg] "}

	if err := t.cmd.Start(); err != nil {
		return fmt.Errorf("failed to start ffmpeg: %w", err)
	}

	t.isRunning = true
	log.Println("Transcoder started")

	// Wait for ffmpeg to finish in background
	go func() {
		err := t.cmd.Wait()
		t.mu.Lock()
		t.isRunning = false
		t.mu.Unlock()
		if err != nil {
			log.Printf("FFmpeg exited with error: %v", err)
		} else {
			log.Println("FFmpeg exited normally")
		}
	}()

	return nil
}

func (t *Transcoder) Write(data []byte) (int, error) {
	t.mu.Lock()
	stdin := t.stdin
	running := t.isRunning
	t.mu.Unlock()

	if !running || stdin == nil {
		return 0, fmt.Errorf("transcoder not running")
	}

	return stdin.Write(data)
}

func (t *Transcoder) Stop() {
	t.mu.Lock()
	defer t.mu.Unlock()

	if !t.isRunning {
		return
	}

	if t.stdin != nil {
		t.stdin.Close()
	}

	if t.cmd != nil && t.cmd.Process != nil {
		t.cmd.Process.Kill()
	}

	t.isRunning = false
	log.Println("Transcoder stopped")

	// Clean up HLS files
	t.cleanupHLSFiles()
}

func (t *Transcoder) cleanupHLSFiles() {
	entries, err := os.ReadDir(t.hlsDir)
	if err != nil {
		log.Printf("Failed to read HLS directory for cleanup: %v", err)
		return
	}

	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		path := filepath.Join(t.hlsDir, entry.Name())
		if err := os.Remove(path); err != nil {
			log.Printf("Failed to delete %s: %v", entry.Name(), err)
		}
	}
	log.Println("HLS files cleaned up")
}

func (t *Transcoder) IsRunning() bool {
	t.mu.Lock()
	defer t.mu.Unlock()
	return t.isRunning
}

// ffmpegLogger implements io.Writer to log ffmpeg output
type ffmpegLogger struct {
	prefix string
}

func (l *ffmpegLogger) Write(p []byte) (n int, err error) {
	log.Printf("%s%s", l.prefix, string(p))
	return len(p), nil
}
