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
const ALIRADAR_SCRIPT_PATH = path.join(BASE_FOLDER, '_scripts/render_aliradar.jsx');
const ALIFUNNY_SCRIPT_PATH = path.join(BASE_FOLDER, '_scripts/render_alifunny.jsx'); 
const ALIGUESS_SCRIPT_PATH = path.join(BASE_FOLDER, '_scripts/render_aliguess.jsx');
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
  console.log('- hero_tag:', data.hero_tag || 'N/A');
  console.log('- hero_title:', data.hero_title || 'N/A');
  console.log('- box_title:', data.box_title || 'N/A'); // ✅ NUOVO
  console.log('- box_question:', data.box_question || 'N/A'); // ✅ NUOVO
  console.log('- hero_solution:', data.hero_solution || 'N/A'); // ✅ NUOVO
  console.log('- season ricevuta:', data.season);
  console.log('- hero_lines:', data.hero_lines?.length || 0);
  console.log('- products:', data.products?.length || 0);
  console.log('- video_url (singolo):', data.video_url || 'N/A');
  console.log('- video_urls (array):', data.video_urls?.length || 0);
  console.log('==================================');

  // DEBUG ALIRADAR
  if (data.template_id === 'aliradar' && data.products) {
    console.log('📦 Products aliradar:');
    data.products.forEach((p, i) => {
      console.log(`  ${i+1}. ${p.name} → ${p.video_url || 'NO VIDEO'}`);
    });
  }

  try {
    const jobId = Date.now().toString();

    // ✅ MULTI-VIDEO SUPPORT
    let videoLocalPaths = [];

    // Gestisci sia video_urls (array) che video_url (singolo) per retrocompatibilità
    if (data.video_urls && Array.isArray(data.video_urls) && data.video_urls.length > 0) {
      // CASO 1: Multi-video (nuovo)
      console.log(`📹 Multi-video: ${data.video_urls.length} clip`);
      
      data.video_urls.forEach((videoUrl, index) => {
        if (!videoUrl || !videoUrl.startsWith('/uploads/')) return;
        
        const filename = path.basename(videoUrl);
        const sourcePath = path.join(UPLOADS_DIR, filename);
        const destPath = path.join(TEMP_DATA_DIR, 'uploads', `input_${jobId}_${index + 1}.mp4`);
        
        if (fs.existsSync(sourcePath)) {
          fs.copyFileSync(sourcePath, destPath);
          videoLocalPaths.push(destPath);
          console.log(`📹 Video ${index + 1} copiato:`, destPath);
        } else {
          console.log(`⚠️ Video ${index + 1} non trovato:`, sourcePath);
        }
      });
      
    } else if (data.video_url && data.video_url.startsWith('/uploads/')) {
      // CASO 2: Singolo video (retrocompatibilità)
      console.log('📹 Singolo video (retrocompatibilità)');
      
      const filename = path.basename(data.video_url);
      const sourcePath = path.join(UPLOADS_DIR, filename);
      const destPath = path.join(TEMP_DATA_DIR, 'uploads', `input_${jobId}.mp4`);
      
      if (fs.existsSync(sourcePath)) {
        fs.copyFileSync(sourcePath, destPath);
        videoLocalPaths.push(destPath);
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
            image_path: imgDest,
            scale: p.scale || 1.0
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
      templateAepPath = data.template_aep_path;
    } else if (templateId === 'alifind') {
      templateAepPath = ALIFIND_AEP_PATH;
    } else if (templateId === 'alireal') {
      templateAepPath = path.join(TEMPLATES_DIR, 'ALIREAL', 'ALIEXPRESS_alireal.aep');
    } else if (templateId === 'aliradar') {
      templateAepPath = path.join(TEMPLATES_DIR, 'ALIRADAR', 'ALIEXPRESS_aliradar.aep');
    } else if (templateId === 'alifunny') { // ✅ NUOVO
      templateAepPath = path.join(TEMPLATES_DIR, 'ALIFUNNY', 'AliExpress_alifunny.aep');
    } else if (templateId === 'aliguess') { // ✅ NUOVO
      templateAepPath = path.join(TEMPLATES_DIR, 'ALIGUESS', 'AliExpress_aliguess.aep');
    } else {
      templateAepPath = path.join(TEMPLATES_DIR, 'ALIEXPRESS_MASTER.aep');
    }

    console.log(`🎯 Template ID: ${templateId}`);
    console.log(`📁 AEP Path: ${templateAepPath}`);

    // ✅ ALIRADAR: Copia video prodotti
    let productsWithVideos = [];

    if (data.template_id === 'aliradar' && Array.isArray(data.products)) {
      data.products.forEach((p, i) => {
        if (!p || !p.name || !p.video_url) return;
        
        if (p.video_url.startsWith('/uploads/')) {
          const videoFilename = path.basename(p.video_url);
          const videoSource = path.join(UPLOADS_DIR, videoFilename);
          const videoDest = path.join(TEMP_DATA_DIR, 'uploads', `prod_video_${jobId}_${i + 1}.mp4`);
          
          if (fs.existsSync(videoSource)) {
            fs.copyFileSync(videoSource, videoDest);
            console.log(`📹 Video prodotto ${i+1} copiato:`, videoDest);
            
            productsWithVideos.push({
              name: p.name,
              video_url: videoDest
            });
          } else {
            console.log(`⚠️ Video prodotto ${i+1} non trovato:`, videoSource);
          }
        }
      });
    }

    // ✅ CREA JOB DATA CON MULTI-VIDEO
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
      
      // ✅ AGGIUNGI PER ALIRADAR
      hero_tag: data.hero_tag || '',
      hero_title: data.hero_title || '',
      
      // ✅ AGGIUNGI PER ALIFUNNY
      box_title: data.box_title || '',
      box_question: data.box_question || '',
      hero_solution: data.hero_solution || '',

      // ✅ AGGIUNGI PER ALIGUESS
      text_layout: data.text_layout || 'center',

      
      // ✅ FIX: Usa array invece di singolo path
      input_video_paths: videoLocalPaths.length > 0 ? videoLocalPaths : null,
      // ✅ Mantieni anche il campo vecchio per retrocompatibilità
      input_video_path: videoLocalPaths.length > 0 ? videoLocalPaths[0] : null,
      
      // ✅ Usa productsWithVideos per aliradar, productsLocal per alifind
      products: data.template_id === 'aliradar' ? productsWithVideos : productsLocal,
      
      season: data.season || 'inverno',
      output_path: path.join(OUTPUT_DIR, `output_${jobId}.mp4`),
      timestamp: new Date().toISOString()
    };

    // ✅ Crea file unico per ogni job
    const jsonPath = path.join(TEMP_DATA_DIR, `job_data_${jobId}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(jobData, null, 2));
    console.log('📝 Job data scritto in:', jsonPath);
    console.log('💾 Video paths nel JSON:', jobData.input_video_paths);
    console.log('💾 Season:', jobData.season);

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
        } else if (templateId === 'aliradar') {
          scriptToRun = ALIRADAR_SCRIPT_PATH;
        } else if (templateId === 'alifunny') { 
          scriptToRun = ALIFUNNY_SCRIPT_PATH;
        } else if (templateId === 'aliguess') { 
          scriptToRun = ALIGUESS_SCRIPT_PATH;
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

            // ✅ DEBUG: Log ogni 10 secondi
            if (checkCount % 10 === 0) {
              console.log(`⏳ Check ${checkCount}/${maxChecks}`);
              console.log(`   Cerco: ${outputPath}`);
              console.log(`   Esiste: ${fs.existsSync(outputPath)}`);
              
              // Lista file nella cartella output
              try {
                const files = fs.readdirSync(OUTPUT_DIR);
                const mp4Files = files.filter(f => f.endsWith('.mp4'));
                console.log(`   MP4 in cartella: ${mp4Files.length} → ${mp4Files.slice(-3).join(', ')}`);
              } catch(e) {}
            }

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
              setTimeout(() => {
                exec(`pkill -x "After Effects"`, (quitErr) => {
                  if (quitErr) {
                    console.log('⚠️ After Effects già chiuso o errore pkill:', quitErr.message);
                  } else {
                    console.log('✅ After Effects chiuso automaticamente!');
                  }
                });
              }, 5000);

            } else if (checkCount >= maxChecks) {
              console.error('❌ Timeout: render non completato');
              
              // ✅ DEBUG: Lista file finali
              try {
                const files = fs.readdirSync(OUTPUT_DIR);
                const mp4Files = files.filter(f => f.endsWith('.mp4'));
                console.error(`   File MP4 trovati: ${mp4Files.join(', ')}`);
              } catch(e) {}
              
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
  console.log(`📜 Script AliRadar: ${ALIRADAR_SCRIPT_PATH}`);
  console.log(`📜 Script AliFunny: ${ALIFUNNY_SCRIPT_PATH}`); 
  console.log(`📜 Script AliGuess: ${ALIGUESS_SCRIPT_PATH}`); 
  console.log(`📹 Video temp: ${TEMP_DATA_DIR}`);
  
  console.log(`📤 Output: ${OUTPUT_DIR}`);
  console.log(`📦 Templates: ${TEMPLATES_DIR}`);
  console.log(`🎨 Remove BG: ${fs.existsSync(path.join(__dirname, 'remove_bg.py')) ? 'ATTIVO ✅' : 'DISABILITATO ⚠️'}`);
  console.log(`🎬 Multi-video support: ATTIVO ✅`);
});
