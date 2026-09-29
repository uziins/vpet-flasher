import fs from 'fs/promises';
import { existsSync } from 'fs';
import readline from 'readline/promises';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function loadEnv() {
  try {
    const envContent = await fs.readFile('.env', 'utf8');
    envContent.split('\n').forEach(line => {
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match) {
        process.env[match[1].trim()] = match[2].trim();
      }
    });
  } catch (e) {
    // Silently ignore if .env doesn't exist
  }
}

async function run() {
  await loadEnv();
  // Default values
  const SCP_HOST = process.env.SCP_HOST || 'nami';
  const SCP_PATH = process.env.SCP_PATH || '/var/www/vpet-flasher';

  console.log('====================================');
  console.log('🚀 Diginode Auto Release & Deploy 🚀');
  console.log('====================================\n');
  
  const versionsPath = 'public/versions.json';
  let versions = JSON.parse(await fs.readFile(versionsPath, 'utf8'));
  
  console.log('Riwayat Versi Saat Ini:');
  versions.forEach(v => console.log(`- ${v.version} : ${v.name}`));
  console.log('------------------------------------\n');
  
  const isNewRelease = (await rl.question('Apakah Anda ingin membuat rilis versi baru sebelum deploy? (y/N): ')).toLowerCase() === 'y';
  
  if (isNewRelease) {
    const newVersion = await rl.question('Masukkan versi baru (contoh: 1.1.0): ');
    let label = await rl.question('Masukkan label rilis (tekan enter untuk "Latest"): ');
    if (!label) label = "Latest";
    
    const versionName = `Diginode v${newVersion} (${label})`;
    let binPath = await rl.question('Masukkan path absolut/relatif ke firmware.bin: ');
    
    if (!binPath) {
      binPath = '../vpet-esp/DigimonVPet/.pio/build/esp32dev/firmware.bin';
    }
    
    if (!existsSync(binPath)) {
      console.error(`\n❌ ERROR: File firmware tidak ditemukan di ${binPath}`);
      console.error('Pastikan Anda sudah melakukan Build di CLion/PlatformIO.');
      process.exit(1);
    }
    
    const versionDir = `public/firmware/v${newVersion}`;
    await fs.mkdir(versionDir, { recursive: true });
    
    console.log(`\n📦 Menyalin ${binPath} -> ${versionDir}/app.bin...`);
    await fs.copyFile(binPath, `${versionDir}/app.bin`);
    
    const manifestContent = {
      "name": "Diginode",
      "version": newVersion,
      "builds": [
        {
          "chipFamily": "ESP32",
          "parts": [
            { "path": "../../system/bootloader.bin", "offset": 4096 },
            { "path": "../../system/partitions.bin", "offset": 32768 },
            { "path": "../../system/boot_app0.bin", "offset": 57344 },
            { "path": `./app.bin`, "offset": 65536 }
          ]
        }
      ]
    };
    
    console.log(`📝 Membuat ${versionDir}/manifest.json...`);
    await fs.writeFile(`${versionDir}/manifest.json`, JSON.stringify(manifestContent, null, 2));
    
    // Bersihkan label (Latest) dari versi-versi lama agar tidak ada nama ganda
    if (label.toLowerCase() === 'latest') {
      versions.forEach(v => {
        v.name = v.name.replace(/\s*\(Latest\)/gi, '');
      });
    }
    
    versions.unshift({
      version: `v${newVersion}`,
      name: versionName,
      manifest: `./firmware/v${newVersion}/manifest.json`
    });
    
    await fs.writeFile(versionsPath, JSON.stringify(versions, null, 2));
    console.log('✅ Versi baru berhasil ditambahkan!\n');
  } else {
    console.log('\nMelewati proses rilis, langsung menuju Deploy...\n');
  }
  
  console.log('⚙️  Memulai proses build (Vite)...');
  try {
    const { stdout } = await execAsync('npm run build');
    console.log(stdout);
  } catch (e) {
    console.error('❌ Build gagal:\n', e.stdout || e.message);
    process.exit(1);
  }
  
  console.log(`\n🚀 Mengunggah ke server via SCP...`);
  console.log(`Tujuan: ${SCP_HOST}:${SCP_PATH}`);
  try {
    const { stdout, stderr } = await execAsync(`scp -r dist/* ${SCP_HOST}:${SCP_PATH}`);
    if (stdout) console.log(stdout);
    if (stderr) console.error(stderr);
    console.log('\n🎉 Deploy berhasil diselesaikan!');
  } catch (e) {
    console.error('\n❌ SCP gagal. Pastikan config/host di .env benar dan server bisa diakses (atau folder tujuan di server belum ada).');
    console.error(e.message);
  }
  
  rl.close();
}

run();
