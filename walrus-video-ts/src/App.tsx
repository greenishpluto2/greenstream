import { getFullnodeUrl, SuiClient } from "@mysten/sui/client";
import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";

const DATA_URL = "https://aggregator.walrus-testnet.walrus.space/v1/blobs/aNS_ka-imNEVlrJ_B8XLR1mvffeU6EXEyO-HHlPe88c";

function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [qualities, setQualities] = useState<{ height?: number; width?: number; level?: number }[]>([]);
  const [currentQuality, setCurrentQuality] = useState<number>(-1);
  const [showQualityMenu, setShowQualityMenu] = useState(false);

  const suiClient = new SuiClient({
    url: getFullnodeUrl("testnet"),
  });

  useEffect(() => {
    const init = async () => {
      const videoMetaData = await suiClient.getObject({
        id: "0x2",
        options: {
          showContent: true,
        },
      });

      console.log(videoMetaData);
    };

    init();
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Check if HLS is supported natively
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      // Native HLS support (Safari)
      video.src = DATA_URL;
      video.addEventListener("loadedmetadata", () => {
        console.log("Video loaded with native HLS support");
      });
    } else if (Hls.isSupported()) {
      // Use hls.js for browsers that don't support HLS natively
      const hls = new Hls({
        debug: false,
        enableWorker: true,
        lowLatencyMode: true,
      });

      hlsRef.current = hls;

      hls.loadSource(DATA_URL);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        console.log("HLS manifest parsed, video ready to play");

        // Get available quality levels
        const levels = hls.levels;
        setQualities(levels);
        setCurrentQuality(hls.currentLevel);

        video.play().catch((e) => console.log("Auto-play prevented:", e));
      });

      hls.on(Hls.Events.LEVEL_SWITCHED, (event, data) => {
        setCurrentQuality(data.level);
      });

      hls.on(Hls.Events.ERROR, (event, data) => {
        console.error("HLS error:", data);
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              console.log("Network error, trying to recover...");
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              console.log("Media error, trying to recover...");
              hls.recoverMediaError();
              break;
            default:
              console.log("Fatal error, destroying HLS instance");
              hls.destroy();
              break;
          }
        }
      });
    } else {
      console.error("HLS is not supported in this browser");
    }

    // Cleanup function
    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, []);

  const handleQualityChange = (levelIndex: number) => {
    if (hlsRef.current) {
      hlsRef.current.currentLevel = levelIndex;
      setCurrentQuality(levelIndex);
      setShowQualityMenu(false);
    }
  };

  const getQualityLabel = (level: { height?: number; width?: number; level?: number }) => {
    if (level.height) {
      return `${level.height}p`;
    }
    if (level.width) {
      return `${level.width}w`;
    }
    return `Level ${level.level}`;
  };

  return (
    <div style={{ padding: "20px", maxWidth: "800px", margin: "0 auto" }}>
      <h1>Walrus Video Player</h1>
      <div style={{ position: "relative" }}>
        <video ref={videoRef} controls style={{ width: "100%", maxWidth: "100%", height: "auto" }} preload="metadata">
          Your browser does not support the video tag.
        </video>

        {/* Quality Control Button */}
        {qualities.length > 1 && (
          <div style={{ position: "absolute", top: "10px", right: "10px", zIndex: 10 }}>
            <button
              onClick={() => setShowQualityMenu(!showQualityMenu)}
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
              {currentQuality >= 0 && qualities[currentQuality] ? getQualityLabel(qualities[currentQuality]) : "Auto"}
            </button>

            {/* Quality Menu */}
            {showQualityMenu && (
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
                  onClick={() => handleQualityChange(-1)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "white",
                    padding: "8px 16px",
                    cursor: "pointer",
                    width: "100%",
                    textAlign: "left",
                    fontSize: "12px",
                    ...(currentQuality === -1 && { background: "rgba(255, 255, 255, 0.2)" }),
                  }}
                >
                  Auto
                </button>
                {qualities.map((level, index) => (
                  <button
                    key={index}
                    onClick={() => handleQualityChange(index)}
                    style={{
                      background: "none",
                      border: "none",
                      color: "white",
                      padding: "8px 16px",
                      cursor: "pointer",
                      width: "100%",
                      textAlign: "left",
                      fontSize: "12px",
                      ...(currentQuality === index && { background: "rgba(255, 255, 255, 0.2)" }),
                    }}
                  >
                    {getQualityLabel(level)}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ marginTop: "10px" }}>
        <p>
          Playing from: <code>{DATA_URL}</code>
        </p>
        {qualities.length > 0 && (
          <p>
            Available qualities:{" "}
            {qualities
              .map((level, index) => `${getQualityLabel(level)}${index < qualities.length - 1 ? ", " : ""}`)
              .join("")}
          </p>
        )}
      </div>
    </div>
  );
}

export default App;
