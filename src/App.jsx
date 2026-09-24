import { useState, useEffect } from 'react';
import { Transport, ESPLoader } from 'esptool-js';
import './App.css';

function App() {
  const [appState, setAppState] = useState("DISCONNECTED"); // DISCONNECTED, CONNECTING, DASHBOARD, FLASHING
  const [deviceInfo, setDeviceInfo] = useState(null);
  
  const [versions, setVersions] = useState([]);
  const [selectedManifest, setSelectedManifest] = useState("");
  const [isLoadingVersions, setIsLoadingVersions] = useState(true);
  
  const [logs, setLogs] = useState([]);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    fetch('./versions.json')
      .then(res => res.json())
      .then(data => {
        setVersions(data);
        if (data.length > 0) {
          setSelectedManifest(data[0].manifest);
        }
        setIsLoadingVersions(false);
      })
      .catch(err => {
        console.error("Failed to load versions", err);
        setIsLoadingVersions(false);
      });
  }, []);

  const handleConnect = async () => {
    try {
      setAppState("CONNECTING");
      
      const port = await navigator.serial.requestPort();
      const transport = new Transport(port, true);
      await transport.connect();
      
      const loader = new ESPLoader({
        transport,
        baudrate: 115200,
        terminal: {
          clean: () => setLogs([]),
          writeLine: (data) => setLogs(prev => [...prev, data + '\n']),
          write: (data) => setLogs(prev => [...prev, data])
        }
      });
      
      await loader.main();
      
      const chipDescription = await loader.chip.getChipDescription(loader);
      const mac = await loader.chip.readMac(loader);
      const flashSize = await loader.detectFlashSize();
      
      setDeviceInfo({
        chip: chipDescription,
        mac: mac,
        flashSize: flashSize || "Unknown",
        loader: loader
      });
      
      setAppState("DASHBOARD");
    } catch (e) {
      console.error(e);
      setAppState("DISCONNECTED");
      alert("Gagal terhubung: " + e.message);
    }
  };

  const handleFlash = async () => {
    if (!deviceInfo || !deviceInfo.loader) return;
    
    try {
      setAppState("FLASHING");
      setProgress(0);
      setLogs([]);
      
      const loader = deviceInfo.loader;
      loader.info("Memuat manifest...");
      
      const manifestRes = await fetch(selectedManifest);
      const manifest = await manifestRes.json();
      
      const parts = manifest.builds[0].parts;
      const fileArray = [];
      
      for (let part of parts) {
        loader.info(`Mengunduh part: ${part.path}`);
        const partUrl = new URL(part.path, new URL(selectedManifest, window.location.href)).href;
        const partRes = await fetch(partUrl);
        const buffer = await partRes.arrayBuffer();
        fileArray.push({
          data: new Uint8Array(buffer),
          address: part.offset
        });
      }
      
      loader.info("Memulai proses flashing...");
      
      await loader.writeFlash({
        fileArray,
        flashSize: "keep",
        flashMode: "keep",
        flashFreq: "keep",
        eraseAll: false,
        compress: true,
        reportProgress: (fileIndex, written, total) => {
          setProgress(Math.round((written / total) * 100));
        }
      });
      
      loader.info("Flashing Selesai!");
      await loader.hardReset();
      
      setAppState("DASHBOARD");
      alert("Flashing berhasil!");
    } catch (e) {
      console.error(e);
      alert("Flashing gagal: " + e.message);
      setAppState("DASHBOARD");
    }
  };

  const renderDisconnected = () => (
    <>
      <p>
        Flash firmware terbaru langsung ke device Diginode Anda melalui browser. 
        Sambungkan device menggunakan kabel USB dan klik tombol di bawah untuk memulai.
      </p>
      <div className="install-action">
        <button className="connect-btn" onClick={handleConnect} disabled={appState === "CONNECTING"}>
          {appState === "CONNECTING" ? "Menghubungkan..." : "Hubungkan Perangkat"}
        </button>
      </div>
    </>
  );

  const renderDashboard = () => (
    <div className="dashboard">
      <div className="device-info-card">
        <h3>ℹ️ Informasi Perangkat</h3>
        <p><strong>Chip:</strong> {deviceInfo.chip}</p>
        <p><strong>MAC Address:</strong> {deviceInfo.mac}</p>
        <p><strong>Flash Size:</strong> {deviceInfo.flashSize}</p>
      </div>

      <div className="version-selector-container">
        <label htmlFor="version-select" className="version-label">Pilih Versi Firmware:</label>
        <div className="select-wrapper">
          {isLoadingVersions ? (
            <select id="version-select" className="glass-select" disabled>
              <option>Memuat...</option>
            </select>
          ) : (
            <select 
              id="version-select" 
              className="glass-select"
              value={selectedManifest} 
              onChange={(e) => setSelectedManifest(e.target.value)}
              disabled={appState === "FLASHING"}
            >
              {versions.map((v, i) => (
                <option key={i} value={v.manifest}>
                  {v.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      <div className="install-action">
        <button 
          className="flash-btn" 
          onClick={handleFlash} 
          disabled={appState === "FLASHING"}
        >
          {appState === "FLASHING" ? `Flashing... ${progress}%` : "Mulai Flashing"}
        </button>
      </div>

      {appState === "FLASHING" && (
        <div className="progress-bar-container">
          <div className="progress-bar" style={{ width: `${progress}%` }}></div>
        </div>
      )}

      {logs.length > 0 && (
        <div className="terminal-logs">
          <pre>{logs.join("")}</pre>
        </div>
      )}
    </div>
  );

  return (
    <div className="glass-container">
      <h1>Diginode</h1>
      
      {appState === "DISCONNECTED" || appState === "CONNECTING" ? renderDisconnected() : renderDashboard()}
      
      <div className="features">
        <div className="feature-card">
          <h3>⚡ Instan</h3>
          <p>Tidak perlu install driver, software, atau tools tambahan. Cukup pakai browser Chrome/Edge.</p>
        </div>
        <div className="feature-card">
          <h3>🎮 Plug & Play</h3>
          <p>Setelah flashing selesai, Diginode Anda siap dimainkan seketika.</p>
        </div>
      </div>
    </div>
  )
}

export default App;
