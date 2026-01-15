const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const app = express();
const PORT = 3001;

app.use(cors());
app.use(bodyParser.json());

const BASE_FOLDER = '/Users/francesco.cerisano/Documents/ai-campaign-manager';
const SCRIPT_PATH = path.join(BASE_FOLDER, '_scripts/render_script.jsx');
const TEMP_DATA_DIR = path.join(BASE_FOLDER, '_temp_data');
const OUTPUT_DIR = path.join(BASE_FOLDER, '_output');
const UPLOADS_DIR = path.join(BASE_FOLDER, 'web-ui/public/uploads');

// Assicurati che le cartelle esistano
[TEMP_DATA_DIR, OUTPUT_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

app.post('/render', (req, res) => {
  console.log('📥 Rx: Richiesta di render ricevuta!');
  const data = req.body;

  try {
    const jobId = Date.now().toString();
    
    // Copia video da uploads a _temp_data se esiste
    let videoLocalPath = null;
    if (data.video_url && data.video_url.startsWith('/uploads/')) {
      const filename = path.basename(data.video_url);
      const sourcePath = path.join(UPLOADS_DIR, filename);
      const destPath = path.join(TEMP_DATA_DIR, `input_${jobId}.mp4`);
      
      if (fs.existsSync(sourcePath)) {
        fs.copyFileSync(sourcePath, destPath);
        videoLocalPath = destPath;
        console.log('📹 Video copiato:', destPath);
      } else {
        console.log('⚠️  Video non trovato:', sourcePath);
      }
    }

    // Prepara job_data.json
    const jobData = {
      job_id: jobId,
      product_name: data.product_name || 'Prodotto Test',
      hero_lines: data.hero_lines || [],
      video_path: videoLocalPath,
      output_path: path.join(OUTPUT_DIR, `output_${jobId}.mov`),
      timestamp: new Date().toISOString()
    };

    const jsonPath = path.join(TEMP_DATA_DIR, 'job_data.json');
    fs.writeFileSync(jsonPath, JSON.stringify(jobData, null, 2));
    console.log('💾 Scritto:', jsonPath);

    // Crea status file
    const statusPath = path.join(TEMP_DATA_DIR, `status_${jobId}.json`);
    fs.writeFileSync(statusPath, JSON.stringify({ 
      status: 'rendering', 
      progress: 10,
      started_at: Date.now()
    }));

    console.log('🎬 Apertura After Effects 2025...');
    
    exec('open -a "Adobe After Effects 2025"', (openError) => {
      if (openError) {
        console.error('❌ Errore apertura AE:', openError);
        fs.writeFileSync(statusPath, JSON.stringify({ 
          status: 'failed', 
          error: 'Impossibile aprire After Effects 2025',
          completed_at: Date.now()
        }));
        return;
      }
      
      console.log('✅ After Effects 2025 aperto, attendo inizializzazione...');
      
      fs.writeFileSync(statusPath, JSON.stringify({ 
        status: 'rendering', 
        progress: 30,
        started_at: Date.now()
      }));
      
      setTimeout(() => {
        console.log('📜 Esecuzione script JSX...');
        console.log('   Script path: ' + SCRIPT_PATH);
        
        const osaCmd = `osascript -e 'tell application "Adobe After Effects 2025"' -e 'activate' -e 'DoScriptFile "${SCRIPT_PATH}"' -e 'end tell'`;
        
        console.log('🔧 Comando AppleScript:', osaCmd);
        
        exec(osaCmd, (scriptError, stdout, stderr) => {
          if (scriptError) {
            console.error('❌ Errore script:', scriptError.message);
            if (stdout) console.error('   stdout:', stdout);
            if (stderr) console.error('   stderr:', stderr);
            
            fs.writeFileSync(statusPath, JSON.stringify({ 
              status: 'failed', 
              error: scriptError.message,
              details: stderr || stdout,
              completed_at: Date.now()
            }));
            return;
          }
          
          console.log('✅ Script eseguito con successo');
          if (stdout) console.log('   Output:', stdout);
        });
      }, 3000);
    });

    res.json({ 
      status: 'success', 
      message: 'Render avviato',
      job_id: jobId
    });

  } catch (err) {
    console.error('❌ Errore generale:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// ✅ Endpoint per status check (con DEBUG)
app.get(['/status/:jobId', '/api/status/:jobId'], (req, res) => {
  const jobId = req.params.jobId;
  const statusPath = path.join(TEMP_DATA_DIR, `status_${jobId}.json`);
  
  console.log('🔍 DEBUG Status richiesto per jobId:', jobId);
  console.log('🔍 DEBUG Path cercato:', statusPath);
  console.log('🔍 DEBUG File esiste?', fs.existsSync(statusPath));
  
  if (fs.existsSync(statusPath)) {
    try {
      const fileContent = fs.readFileSync(statusPath, 'utf8');
      console.log('🔍 DEBUG Contenuto file:', fileContent);
      const status = JSON.parse(fileContent);
      res.json(status);
    } catch(e) {
      console.error('❌ DEBUG Errore lettura file:', e);
      res.status(500).json({ status: 'error', message: e.message });
    }
  } else {
    console.log('❌ DEBUG File non trovato!');
    
    const files = fs.readdirSync(TEMP_DATA_DIR);
    console.log('🔍 DEBUG File presenti in _temp_data:', files);
    
    res.status(404).json({ status: 'not_found' });
  }
});

// ✅✅✅ QUESTA ERA LA RIGA MANCANTE! ✅✅✅
app.listen(PORT, () => {
  console.log(`🚀 Bridge Server attivo su porta ${PORT}`);
  console.log(`📂 Script target: ${SCRIPT_PATH}`);
  console.log(`📹 Video temp: ${TEMP_DATA_DIR}`);
  console.log(`📤 Output: ${OUTPUT_DIR}`);
});
