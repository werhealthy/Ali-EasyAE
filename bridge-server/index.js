const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const { exec, execSync } = require('child_process');
require('dotenv').config();

const app = express();
const PORT = 3001;

app.use(cors());
app.use(bodyParser.json());

const BASE_FOLDER = process.env.EASYAE_BASE || '/Users/francesco.cerisano/Documents/GitHub/Ali-EasyAE';
const AE_APP = process.env.AE_APP || 'Adobe After Effects 2025';
const SCRIPT_PATH = path.join(BASE_FOLDER, '_scripts/render_script.jsx');
const ALIFIND_SCRIPT_PATH = path.join(BASE_FOLDER, '_scripts/render_alifind.jsx');
const ALIREAL_SCRIPT_PATH = path.join(BASE_FOLDER, '_scripts/render_alireal.jsx');
const TEMP_DATA_DIR = path.join(BASE_FOLDER, '_temp_data');
const OUTPUT_DIR = path.join(BASE_FOLDER, '_temp_data', 'renders');
const TEMPLATES_DIR = path.join(BASE_FOLDER, '_templates');
const ALIFIND_TEMPLATES_DIR = path.join(BASE_FOLDER, '_templates', 'ALIFIND');
const ALIFIND_AEP_PATH = path.join(ALIFIND_TEMPLATES_DIR, 'AliExpress_alifinds.aep');
const UPLOADS_DIR = path.join(BASE_FOLDER, 'web-ui/public/uploads');

// Crea directory se non esistono
[TEMP_DATA_DIR, OUTPUT_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// ✅ FUNZIONE REMOVE BACKGROUND
function removeBackground(inputPath, outputPath) {
  try {
    const pythonScript = path.join(__dirname, 'remove_bg.py');
    if (!fs.existsSync(pythonScript)) {
      console.error('⚠️ remove_bg.py non trovato, skip remove BG');
      return false;
    }

    console.log(`🎨 Rimozione background: ${path.basename(inputPath)}...`);
    execSync(`python3 "${pythonScript}" "${inputPath}" "${outputPath}"`, {
      stdio: 'inherit',
      timeout: 120000
    });

    if (fs.existsSync(outputPath)) {
      console.log(`✅ Background rimosso: ${path.basename(outputPath)}`);
      return true;
    } else {
      console.error('⚠️ Output non creato, fallback su immagine originale');
      return false;
    }
  } catch (error) {
    console.error(`⚠️ Errore remove BG: ${error.message}`);
    return false;
  }
}

// ✅ ENDPOINT: Remove BG
app.post('/remove-bg', (req, res) => {
  console.log('🎨 Richiesta remove BG ricevuta');
  const { image_url } = req.body;

  if (!image_url || !image_url.startsWith('/uploads/')) {
    return res.status(400).json({ error: 'URL immagine non valido' });
  }

  try {
    const imgFilename = path.basename(image_url);
    const imgSource = path.join(UPLOADS_DIR, imgFilename);

    if (!fs.existsSync(imgSource)) {
      return res.status(404).json({ error: 'Immagine non trovata' });
    }

    const timestamp = Date.now();
    const noBgFilename = `nobg_${timestamp}_${imgFilename.replace(/\.[^.]+$/, '.png')}`;
    const noBgPath = path.join(UPLOADS_DIR, noBgFilename);

    const success = removeBackground(imgSource, noBgPath);

    if (success) {
      res.json({
        success: true,
        original_url: image_url,
        nobg_url: `/uploads/${noBgFilename}`
      });
    } else {
      res.status(500).json({ error: 'Errore rimozione background' });
    }
  } catch (error) {
    console.error('Errore remove BG:', error);
    res.status(500).json({ error: error.message });
  }
});

// ✅ ENDPOINT: Render
app.post('/render', (req, res) => {
  console.log('📥 Rx: Richiesta di render ricevuta!');
  const data = req.body;

  // ✅ DEBUG: Log del payload ricevuto
  console.log('🔍 ===== DEBUG BRIDGE SERVER =====');
  console.log('- template_id:', data.template_id);
  console.log('- season ricevuta:', data.season);
  console.log('- hero_lines:', data.hero_lines?.length || 0);
  console.log('- products:', data.products?.length || 0);
  console.log('==================================');

  try {
    const jobId = Date.now().toString();
    let videoLocalPath = null;

    // Copia video se presente
    if (data.video_url && data.video_url.startsWith('/uploads/')) {
      const filename = path.basename(data.video_url);
      const sourcePath = path.join(UPLOADS_DIR, filename);
      const destPath = path.join(TEMP_DATA_DIR, 'uploads', `input_${jobId}.mp4`);

      if (fs.existsSync(sourcePath)) {
        fs.copyFileSync(sourcePath, destPath);
        videoLocalPath = destPath;
        console.log('📹 Video copiato:', destPath);
      } else {
        console.log('⚠️ Video non trovato:', sourcePath);
      }
    }

    // ✅ AliFind: copia immagini (già scontornate dalla UI)
    let productsLocal = [];
    if (data.template_id === 'alifind' && Array.isArray(data.products)) {
      data.products.forEach((p, i) => {
        if (!p || !p.image_url || !p.name) return;
        if (!p.image_url.startsWith('/uploads/')) return;

        const imgFilename = path.basename(p.image_url);
        const imgSource = path.join(UPLOADS_DIR, imgFilename);
        const ext = path.extname(imgFilename) || '.png';
        const imgDest = path.join(TEMP_DATA_DIR, 'uploads', `prod_${jobId}_${i + 1}${ext}`);

        if (fs.existsSync(imgSource)) {
          fs.copyFileSync(imgSource, imgDest);
          console.log('🖼️ Immagine prodotto copiata (già scontornata):', imgDest);
          productsLocal.push({
            name: p.name,
            image_path: imgDest
          });
        } else {
          console.log('⚠️ Immagine non trovata:', imgSource);
        }
      });
    }

    const templateId = data.template_id || 'aliexpress_master';

    // ✅ Determina il path corretto del template AEP
    let templateAepPath;
    if (data.template_aep_path) {
      // Path esplicito dal frontend
      templateAepPath = data.template_aep_path;
    } else if (templateId === 'alifind') {
      // AliFind: usa il path definito
      templateAepPath = ALIFIND_AEP_PATH;
    } else if (templateId === 'alireal') {
      // ✅ AliReal: usa il path nella cartella ALIREAL
      templateAepPath = path.join(TEMPLATES_DIR, 'ALIREAL', 'AliExpressREAL.aep');
    } else {
      // Default: ALIEXPRESS_MASTER
      templateAepPath = path.join(TEMPLATES_DIR, 'ALIEXPRESS_MASTER.aep');
    }

    console.log(`🎯 Template ID: ${templateId}`);
    console.log(`📁 AEP Path: ${templateAepPath}`);


    // ✅ CREA JOB DATA CON SEASON
    const jobData = {
      job_id: jobId,
      paths: {
        base: BASE_FOLDER,
        templates: TEMPLATES_DIR,
        temp: TEMP_DATA_DIR,
        output: OUTPUT_DIR
      },
      template_id: templateId,
      template_aep_path: templateAepPath,
      product_name: data.product_name || 'Prodotto Test',
      hero_lines: data.hero_lines || [],
      input_video_path: videoLocalPath,
      products: productsLocal,
      season: data.season || 'inverno', // ✅ AGGIUNTO!
      output_path: path.join(OUTPUT_DIR, `output_${jobId}.mp4`),
      timestamp: new Date().toISOString()
    };

    // ✅ Crea file unico per ogni job
    const jsonPath = path.join(TEMP_DATA_DIR, `job_data_${jobId}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(jobData, null, 2));
    console.log('📝 Job data scritto in:', jsonPath);

    console.log('💾 Scritto job_data.json con season:', jobData.season);

    const statusPath = path.join(TEMP_DATA_DIR, 'processing', `status_${jobId}.json`);
    fs.writeFileSync(statusPath, JSON.stringify({
      status: 'rendering',
      progress: 10,
      started_at: Date.now()
    }));

    console.log(`🎬 Apertura ${AE_APP}...`); 
    exec(`open -a "${AE_APP}"`, (openError) => {
      if (openError) {
        console.error('❌ Errore apertura AE:', openError);
        fs.writeFileSync(statusPath, JSON.stringify({
          status: 'failed',
          error: `Impossibile aprire ${AE_APP}`,
          completed_at: Date.now()
        }));
        return;
      }

      console.log(`✅ ${AE_APP} aperto, attendo inizializzazione...`);
      fs.writeFileSync(statusPath, JSON.stringify({
        status: 'rendering',
        progress: 30,
        started_at: Date.now()
      }));

      setTimeout(() => {
        console.log('📜 Esecuzione script JSX...');
        
        // ✅ Seleziona lo script corretto
        let scriptToRun = SCRIPT_PATH;
        if (templateId === 'alifind') {
          scriptToRun = ALIFIND_SCRIPT_PATH;
        } else if (templateId === 'alireal') {
          scriptToRun = ALIREAL_SCRIPT_PATH;
        }

        console.log('📂 Script selezionato:', scriptToRun);

        const osaCmd = `osascript -e 'tell application "${AE_APP}"' -e 'activate' -e 'DoScriptFile "${scriptToRun}"' -e 'end tell'`;

        exec(osaCmd, (scriptError, stdout, stderr) => {
          if (scriptError) {
            console.error('❌ Errore script:', scriptError.message);
            fs.writeFileSync(statusPath, JSON.stringify({
              status: 'failed',
              error: scriptError.message,
              details: stderr || stdout,
              completed_at: Date.now()
            }));
            return;
          }

          console.log('✅ Script eseguito, attendo render...');

          const outputPath = jobData.output_path;
          let checkCount = 0;
          const maxChecks = 120;

          const checkInterval = setInterval(() => {
            checkCount++;

            if (fs.existsSync(outputPath)) {
              console.log('✅ Render completato! Output trovato:', outputPath);
              
              const videoFilename = path.basename(outputPath);
              
              fs.writeFileSync(statusPath, JSON.stringify({
                status: 'completed',
                progress: 100,
                output_path: `/api/output/${videoFilename}`,
                completed_at: Date.now()
              }));
              
              clearInterval(checkInterval);


              console.log('🛑 Chiusura After Effects senza salvare...');

              // ✅ Chiusura After Effects con nome processo corretto
              setTimeout(() => {
                exec(`pkill -x "After Effects"`, (quitErr) => {
                  if (quitErr) {
                    console.log('⚠️ After Effects già chiuso o errore pkill:', quitErr.message);
                  } else {
                    console.log('✅ After Effects chiuso automaticamente!');
                  }
                });
              }, 2000); // Aspetta 2 secondi dopo il completamento


            } else if (checkCount >= maxChecks) {
              console.error('❌ Timeout: render non completato');
              fs.writeFileSync(statusPath, JSON.stringify({
                status: 'failed',
                error: 'Timeout: render troppo lungo',
                completed_at: Date.now()
              }));
              clearInterval(checkInterval);
            } else {
              const progress = 30 + Math.floor((checkCount / maxChecks) * 60);
              fs.writeFileSync(statusPath, JSON.stringify({
                status: 'rendering',
                progress: progress,
                started_at: Date.now()
              }));
            }
          }, 1000);
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

// ✅ ENDPOINT: Serve video output
app.get('/api/output/:filename', (req, res) => {
  const filename = req.params.filename;
  const videoPath = path.join(OUTPUT_DIR, filename);
  
  if (fs.existsSync(videoPath)) {
    res.sendFile(videoPath);
  } else {
    res.status(404).json({ error: 'Video non trovato' });
  }
});

// ✅ ENDPOINT: Status
app.get(['/status/:jobId', '/api/status/:jobId'], (req, res) => {
  const jobId = req.params.jobId;
  const statusPath = path.join(TEMP_DATA_DIR, 'processing', `status_${jobId}.json`);

  if (fs.existsSync(statusPath)) {
    try {
      const status = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
      res.json(status);
    } catch (e) {
      res.status(500).json({ status: 'error', message: e.message });
    }
  } else {
    res.status(404).json({ status: 'not_found' });
  }
});

// ✅ START SERVER
app.listen(PORT, () => {
  console.log(`🚀 Bridge Server attivo su porta ${PORT}`);
  console.log(`📂 Base folder: ${BASE_FOLDER}`);
  console.log(`📜 Script AliFind: ${ALIFIND_SCRIPT_PATH}`);
  console.log(`📜 Script AliReal: ${ALIREAL_SCRIPT_PATH}`);
  console.log(`📹 Video temp: ${TEMP_DATA_DIR}`);
  console.log(`📤 Output: ${OUTPUT_DIR}`);
  console.log(`📦 Templates: ${TEMPLATES_DIR}`);
  console.log(`🎨 Remove BG: ${fs.existsSync(path.join(__dirname, 'remove_bg.py')) ? 'ATTIVO ✅' : 'DISABILITATO ⚠️'}`);
});
