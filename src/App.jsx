import './App.css'

function App() {
  return (
    <div className="glass-container">
      <h1>Digimon V-Pet ESP32</h1>
      <p>
        Flash firmware terbaru langsung ke device ESP32 Anda melalui browser. 
        Sambungkan device menggunakan kabel USB, klik tombol di bawah, dan pilih port serial device Anda.
      </p>

      {/* The esp-web-install-button is provided by the script loaded in index.html */}
      <esp-web-install-button manifest="./manifest.json"></esp-web-install-button>
      
      <div className="features">
        <div className="feature-card">
          <h3>⚡ Instan</h3>
          <p>Tidak perlu install driver, software, atau tools tambahan. Cukup pakai browser Chrome/Edge.</p>
        </div>
        <div className="feature-card">
          <h3>🎮 Plug & Play</h3>
          <p>Setelah flashing selesai, V-Pet Anda siap dimainkan seketika.</p>
        </div>
      </div>
    </div>
  )
}

export default App
