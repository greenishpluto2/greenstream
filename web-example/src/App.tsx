import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";

const DATA_URL = "https://aggregator.walrus-testnet.walrus.space/v1/blobs/N4FAI95sl_aWcBz_JMDUBNR9XWjWkqKT_J0STyZWtK8";

function useHlsPlayer(videoRef: React.RefObject<HTMLVideoElement | null>, dataUrl: string) {
  const hlsRef = useRef<Hls | null>(null);
  const [qualities, setQualities] = useState<{ height?: number; width?: number; level?: number }[]>([]);
  const [currentQuality, setCurrentQuality] = useState<number>(-1);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Check for native HLS support (Safari)
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = dataUrl;
      video.addEventListener("loadedmetadata", () => {
        console.log("Video loaded with native HLS support");
      });
      return;
    }

    // Use hls.js for other browsers
    if (!Hls.isSupported()) {
      console.error("HLS is not supported in this browser");
      return;
    }

    const hls = new Hls({
      debug: false,
      enableWorker: true,
      lowLatencyMode: true,
    });

    hlsRef.current = hls;
    hls.loadSource(dataUrl);
    hls.attachMedia(video);

    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      console.log("HLS manifest parsed, video ready to play");
      setQualities(hls.levels);
      setCurrentQuality(hls.currentLevel);
      video.play().catch((e) => console.log("Auto-play prevented:", e));
    });

    hls.on(Hls.Events.LEVEL_SWITCHED, (_, data) => {
      setCurrentQuality(data.level);
    });

    hls.on(Hls.Events.ERROR, (_, data) => {
      console.error("HLS error:", data);
      if (data.fatal) {
        switch (data.type) {
          case Hls.ErrorTypes.NETWORK_ERROR:
            hls.startLoad();
            break;
          case Hls.ErrorTypes.MEDIA_ERROR:
            hls.recoverMediaError();
            break;
          default:
            hls.destroy();
            break;
        }
      }
    });

    return () => {
      hls.destroy();
      hlsRef.current = null;
    };
  }, [dataUrl, videoRef]);

  const changeQuality = (levelIndex: number) => {
    if (hlsRef.current) {
      hlsRef.current.currentLevel = levelIndex;
      setCurrentQuality(levelIndex);
    }
  };

  return { qualities, currentQuality, changeQuality };
}

function QualitySelector({
  qualities,
  currentQuality,
  onQualityChange,
  isOpen,
  onToggle,
}: {
  qualities: { height?: number; width?: number; level?: number }[];
  currentQuality: number;
  onQualityChange: (level: number) => void;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const getQualityLabel = (level: { height?: number; width?: number; level?: number }) => {
    if (level.height) return `${level.height}p`;
    if (level.width) return `${level.width}w`;
    return `Level ${level.level}`;
  };

  const currentLabel =
    currentQuality >= 0 && qualities[currentQuality] ? getQualityLabel(qualities[currentQuality]) : "Auto";

  return (
    <div style={{ position: "absolute", top: "10px", right: "10px", zIndex: 10 }}>
      <button
        onClick={onToggle}
        style={{
          background: "rgba(0, 0, 0, 0.7)",
          color: "white",
          border: "none",
          padding: "8px 12px",
          borderRadius: "4px",
          cursor: "pointer",
          fontSize: "12px",
          fontWeight: "bold",
        }}
      >
        {currentLabel}
      </button>

      {isOpen && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            right: 0,
            background: "rgba(0, 0, 0, 0.9)",
            borderRadius: "4px",
            padding: "8px 0",
            minWidth: "120px",
            marginTop: "4px",
          }}
        >
          <button
            onClick={() => onQualityChange(-1)}
            style={{
              background: currentQuality === -1 ? "rgba(255, 255, 255, 0.2)" : "none",
              border: "none",
              color: "white",
              padding: "8px 16px",
              cursor: "pointer",
              width: "100%",
              textAlign: "left",
              fontSize: "12px",
            }}
          >
            Auto
          </button>
          {qualities.map((level, index) => (
            <button
              key={index}
              onClick={() => onQualityChange(index)}
              style={{
                background: currentQuality === index ? "rgba(255, 255, 255, 0.2)" : "none",
                border: "none",
                color: "white",
                padding: "8px 16px",
                cursor: "pointer",
                width: "100%",
                textAlign: "left",
                fontSize: "12px",
              }}
            >
              {getQualityLabel(level)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [showQualityMenu, setShowQualityMenu] = useState(false);
  const [videoUrl, setVideoUrl] = useState(DATA_URL);
  const [inputUrl, setInputUrl] = useState(DATA_URL);

  const { qualities, currentQuality, changeQuality } = useHlsPlayer(videoRef, videoUrl);

  const handleQualityChange = (levelIndex: number) => {
    changeQuality(levelIndex);
    setShowQualityMenu(false);
  };

  const handleUrlChange = (e: React.FormEvent) => {
    e.preventDefault();
    setVideoUrl(inputUrl);
  };

  return (
    <div style={{ padding: "20px", maxWidth: "800px", margin: "0 auto" }}>
      <h1>HLS Video Player</h1>

      <form onSubmit={handleUrlChange} style={{ marginBottom: "20px" }}>
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <label htmlFor="video-url" style={{ fontWeight: "bold", minWidth: "80px" }}>
            Video URL:
          </label>
          <input
            id="video-url"
            type="url"
            value={inputUrl}
            onChange={(e) => setInputUrl(e.target.value)}
            placeholder="Enter HLS stream URL"
            style={{
              flex: 1,
              padding: "8px 12px",
              border: "1px solid #ccc",
              borderRadius: "4px",
              fontSize: "14px",
            }}
          />
          <button
            type="submit"
            style={{
              padding: "8px 16px",
              backgroundColor: "#007bff",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              fontSize: "14px",
            }}
          >
            Load
          </button>
        </div>
      </form>

      <div style={{ position: "relative" }}>
        <video ref={videoRef} controls style={{ width: "100%", maxWidth: "100%", height: "auto" }} preload="metadata">
          Your browser does not support the video tag.
        </video>

        {qualities.length > 1 && (
          <QualitySelector
            qualities={qualities}
            currentQuality={currentQuality}
            onQualityChange={handleQualityChange}
            isOpen={showQualityMenu}
            onToggle={() => setShowQualityMenu(!showQualityMenu)}
          />
        )}
      </div>

      <div style={{ marginTop: "10px" }}>
        <p>
          Playing from: <code>{videoUrl}</code>
        </p>
      </div>
    </div>
  );
}

export default App;
