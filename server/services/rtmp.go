package services

import (
	"log"
	"strings"
	"sync"

	"github.com/nareix/joy4/av/avutil"
	"github.com/nareix/joy4/av/pktque"
	"github.com/nareix/joy4/format/flv"
	"github.com/nareix/joy4/format/rtmp"
)

type RTMPServer struct {
	mu          sync.Mutex
	server      *rtmp.Server
	streamKey   string
	hlsDir      string
	isStreaming bool
}

var (
	rtmpServer     *RTMPServer
	rtmpServerOnce sync.Once
)

func GetRTMPServer(streamKey string, hlsDir string) *RTMPServer {
	rtmpServerOnce.Do(func() {
		rtmpServer = &RTMPServer{
			streamKey: streamKey,
			hlsDir:    hlsDir,
		}
	})
	return rtmpServer
}

func (rs *RTMPServer) Start(port string) error {
	rs.mu.Lock()
	defer rs.mu.Unlock()

	addr := ":" + port

	rs.server = &rtmp.Server{
		Addr: addr,
	}

	rs.server.HandlePublish = func(conn *rtmp.Conn) {
		rs.handlePublish(conn)
	}

	log.Printf("RTMP server starting on %s", addr)

	go func() {
		if err := rs.server.ListenAndServe(); err != nil {
			log.Printf("RTMP server error: %v", err)
		}
	}()

	return nil
}

func (rs *RTMPServer) handlePublish(conn *rtmp.Conn) {
	// Extract stream key from URL path
	// URL format: rtmp://server/live/STREAM_KEY
	path := conn.URL.Path
	log.Printf("RTMP publish request for path: %s", path)

	// Parse the stream key from path
	// Path format: /live/STREAM_KEY
	streamKey := ""
	if strings.HasPrefix(path, "/live/") {
		streamKey = strings.TrimPrefix(path, "/live/")
	}

	// Validate stream key
	if streamKey != rs.streamKey {
		log.Printf("Invalid stream key: %s", streamKey)
		conn.Close()
		return
	}

	log.Println("Valid stream key, starting transcoding")
	rs.setStreaming(true)

	// Start transcoder
	transcoder := GetTranscoder(rs.hlsDir)
	if err := transcoder.Start(); err != nil {
		log.Printf("Failed to start transcoder: %v", err)
		conn.Close()
		rs.setStreaming(false)
		return
	}

	// Read streams from RTMP connection
	streams, err := conn.Streams()
	if err != nil {
		log.Printf("Failed to get streams: %v", err)
		conn.Close()
		transcoder.Stop()
		rs.setStreaming(false)
		return
	}

	// Create an FLV muxer to write to transcoder
	muxer := flv.NewMuxer(transcoder)

	// Write header
	if err := muxer.WriteHeader(streams); err != nil {
		log.Printf("Failed to write header: %v", err)
		conn.Close()
		transcoder.Stop()
		rs.setStreaming(false)
		return
	}

	// Create a filter for the packets
	filters := pktque.Filters{}
	demuxer := &pktque.FilterDemuxer{
		Demuxer: conn,
		Filter:  filters,
	}

	// Copy packets from RTMP to FLV muxer (which writes to transcoder)
	err = avutil.CopyPackets(muxer, demuxer)
	if err != nil {
		log.Printf("Stream ended: %v", err)
	}

	// Write trailer
	muxer.WriteTrailer()
	transcoder.Stop()
	rs.setStreaming(false)
	log.Println("RTMP stream ended")
}

func (rs *RTMPServer) setStreaming(streaming bool) {
	rs.mu.Lock()
	defer rs.mu.Unlock()
	rs.isStreaming = streaming
}

func (rs *RTMPServer) IsStreaming() bool {
	rs.mu.Lock()
	defer rs.mu.Unlock()
	return rs.isStreaming
}

func (rs *RTMPServer) Stop() {
	rs.mu.Lock()
	defer rs.mu.Unlock()
	// Note: joy4's rtmp.Server doesn't have a built-in stop method
	// The server will stop when the process exits
	log.Println("RTMP server stop requested")
}

func (rs *RTMPServer) GetAddr() string {
	if rs.server != nil {
		return rs.server.Addr
	}
	return ""
}
