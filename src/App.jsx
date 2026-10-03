import { useState, useEffect } from 'react';
import { Transport, ESPLoader } from 'esptool-js';
import './App.css';

let globalTransport = null;

function App() {
  const [appState, setAppState] = useState("DISCONNECTED"); // DISCONNECTED, CONNECTING, DASHBOARD, FLASHING
  const [deviceInfo, setDeviceInfo] = useState(null);
  
  const [versions, setVersions] = useState([]);
  const [selectedManifest, setSelectedManifest] = useState("");
  const [isLoadingVersions, setIsLoadingVersions] = useState(true);
  
  const [logs, setLogs] = useState([]);
  const [progress, setProgress] = useState(0);
  const [showConfirm, setShowConfirm] = useState(false);

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
    let transport = null;
    
    // Bersihkan transport global jika ada (berguna saat hot-reload/strict mode)
    if (globalTransport) {
      try {
        await globalTransport.disconnect();
      } catch (e) {
        console.warn("Failed to close old transport:", e);
      }
      globalTransport = null;
    }

    try {
      setAppState("CONNECTING");
      
      const port = await navigator.serial.requestPort();
      transport = new Transport(port, true);
      globalTransport = transport;
      
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
      if (transport) {
        try {
          await transport.disconnect();
        } catch (disconnectErr) {
          console.error("Failed to disconnect after error", disconnectErr);
        }
      }
      setAppState("DISCONNECTED");
      alert("Failed to connect: " + e.message + "\n\nIf it keeps failing, unplug and replug the USB cable or refresh this page.");
    }
  };

  const executeFlash = async () => {
    setShowConfirm(false);
    if (!deviceInfo || !deviceInfo.loader) return;
    
    try {
      setAppState("FLASHING");
      setProgress(0);
      setLogs([]);
      
      const loader = deviceInfo.loader;
      loader.info("Loading manifest...");
      
      const manifestRes = await fetch(selectedManifest);
      const manifest = await manifestRes.json();
      
      const parts = manifest.builds[0].parts;
      const fileArray = [];
      
      for (let part of parts) {
        loader.info(`Downloading part: ${part.path}`);
        const partUrl = new URL(part.path, new URL(selectedManifest, window.location.href)).href;
        const partRes = await fetch(partUrl);
        const buffer = await partRes.arrayBuffer();
        fileArray.push({
          data: new Uint8Array(buffer),
          address: part.offset
        });
      }
      
      loader.info("Starting flashing process...");
      
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
      
      loader.info("Flashing Completed!");
      loader.info("Restarting device...");
      
      // Manual hard reset sequence via DTR/RTS
      if (globalTransport) {
        try {
          await globalTransport.setSignals(false, true); // EN=Low, Reset
          await new Promise(r => setTimeout(r, 100));
          await globalTransport.setSignals(false, false); // EN=High, Boot
          await new Promise(r => setTimeout(r, 200));
          await globalTransport.disconnect();
        } catch (resetErr) {
          console.warn("Failed to reset device via DTR/RTS:", resetErr);
        }
        globalTransport = null;
      }
      setDeviceInfo(null);
      setAppState("DISCONNECTED");
      alert("Flashing successful! The device has been disconnected and will now restart.");
    } catch (e) {
      console.error(e);
      alert("Flashing failed: " + e.message);
      setAppState("DASHBOARD");
    }
  };

  const handleDisconnect = async () => {
    if (globalTransport) {
      try {
        await globalTransport.disconnect();
      } catch (e) {
        console.error("Error disconnecting:", e);
      }
      globalTransport = null;
    }
    setDeviceInfo(null);
    setAppState("DISCONNECTED");
  };

  const renderDisconnected = () => (
    <>
      <p>
        Flash the latest firmware directly to your Diginode device via browser. 
        Connect your device using a USB cable and click the button below to start.
      </p>
      <div className="install-action">
        <button className="connect-btn" onClick={handleConnect} disabled={appState === "CONNECTING"}>
          {appState === "CONNECTING" ? "Connecting..." : "Connect Device"}
        </button>
      </div>
    </>
  );

  const renderDashboard = () => (
    <div className="dashboard">
      <div className="device-info-card">
        <h3>ℹ️ Device Information</h3>
        <p><strong>Chip:</strong> {deviceInfo.chip}</p>
        <p><strong>MAC Address:</strong> {deviceInfo.mac}</p>
        <p><strong>Flash Size:</strong> {deviceInfo.flashSize}</p>
      </div>

      <div className="version-selector-container">
        <label htmlFor="version-select" className="version-label">Select Firmware Version:</label>
        <div className="select-wrapper">
          {isLoadingVersions ? (
            <select id="version-select" className="glass-select" disabled>
              <option>Loading...</option>
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

      <div className="install-action" style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
        <button 
          className="connect-btn" 
          onClick={handleDisconnect} 
          disabled={appState === "FLASHING"}
          style={{ backgroundColor: '#e53e3e', borderColor: '#742a2a' }}
        >
          Disconnect
        </button>
        <button 
          className="flash-btn" 
          onClick={() => setShowConfirm(true)} 
          disabled={appState === "FLASHING"}
        >
          {appState === "FLASHING" ? `Flashing... ${progress}%` : "Start Flashing"}
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
      <img src="diginode-logo.png" alt="Diginode" className="main-logo" style={{ maxWidth: '100%', height: 'auto', maxHeight: '100px', display: 'block', margin: '0 auto 2rem auto', filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.5))' }} />
      
      {appState === "DISCONNECTED" || appState === "CONNECTING" ? renderDisconnected() : renderDashboard()}
      
      {showConfirm && (
        <div className="modal-overlay">
          <div className="modal-content retro-modal">
            <h3 style={{ color: '#e53e3e', marginBottom: '1rem', fontSize: '1.2rem' }}>⚠️ Warning</h3>
            <p style={{ marginBottom: '0.8rem', lineHeight: '1.5', fontSize: '0.8rem', color: '#333' }}>
              This will erase the current firmware on your device and replace it with the selected version.
            </p>
            <p style={{ marginBottom: '1.5rem', fontWeight: 'bold', fontSize: '0.8rem', color: '#000' }}>
              Are you sure you want to proceed?
            </p>
            <div className="modal-actions" style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
              <button 
                className="connect-btn" 
                onClick={() => setShowConfirm(false)}
                style={{ backgroundColor: '#a0aec0', borderColor: '#4a5568', color: '#000' }}
              >
                Cancel
              </button>
              <button 
                className="flash-btn" 
                onClick={executeFlash}
              >
                Proceed
              </button>
            </div>
          </div>
        </div>
      )}
      
    </div>
  )
}

export default App;
