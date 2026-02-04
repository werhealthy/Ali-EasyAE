// ============================================
// SCRIPT: render_aliguess.jsx
// Template: AliExpress AliGuess (Indovina il prodotto)
// Features: Video multi-input + 3 layout testi selezionabili
// ============================================

(function() {

var BASE_FOLDER = '/Users/francesco.cerisano/Documents/GitHub/Ali-EasyAE';
var TEMP_DATA_DIR = BASE_FOLDER + '/_temp_data';
var LOG_FILE_PATH = TEMP_DATA_DIR + '/production_log.txt';
var logFile = new File(LOG_FILE_PATH);

// ============================================
// UTILITY FUNCTIONS
// ============================================

function initLog() {
    logFile.encoding = "UTF-8";
    logFile.open('w');
    logFile.write("========================================\n");
    logFile.write("ALIGUESS LOG - " + new Date().toString() + "\n");
    logFile.write("========================================\n\n");
    logFile.close();
}

function log(msg) {
    $.writeln(msg);
    try {
        logFile.open('a');
        logFile.write(msg + "\n");
        logFile.close();
    } catch(e) {}
}

// ============================================
// MAIN SCRIPT
// ============================================

try {
    initLog();
    
    // ============================================
    // 1. LEGGI JSON
    // ============================================
    log("\n🔍 Cerco job_data...");
    var jobFolder = new Folder(TEMP_DATA_DIR);
    if (!jobFolder.exists) throw new Error("_temp_data non esiste");
    
    var jobFiles = [];
    var files = jobFolder.getFiles("job_data_*.json");
    for (var i = 0; i < files.length; i++) {
        jobFiles.push(files[i]);
    }
    
    jobFiles.sort(function(a, b) {
        var timestampA = parseInt(a.name.replace(/\D/g, ''));
        var timestampB = parseInt(b.name.replace(/\D/g, ''));
        return timestampB - timestampA;
    });
    
    if (jobFiles.length === 0) throw new Error("Nessun job_data trovato");
    
    var jobFile = jobFiles[0];
    log("✅ Job: " + jobFile.name);
    
    jobFile.open('r');
    var content = jobFile.read();
    jobFile.close();
    var jobData = eval('(' + content + ')');
    
    log("\n📦 DATI:");
    log(" text_layout: " + (jobData.text_layout || 'center'));
    log(" video_count: " + (jobData.input_video_paths ? jobData.input_video_paths.length : 0));
    
    // ============================================
    // 2. CHIUDI PROGETTI APERTI
    // ============================================
    log("\n🔍 Chiusura progetti aperti...");
    try {
        if (app.project) {
            app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES);
            log("✅ Progetto chiuso");
        }
    } catch(e) {
        log("⚠️ Ignoro errore chiusura");
    }
    
    // ============================================
    // 3. APRI TEMPLATE
    // ============================================
    log("\n🔍 Apro template...");
    var templateFile = new File(jobData.template_aep_path);
    if (!templateFile.exists) throw new Error("Template non trovato: " + jobData.template_aep_path);
    
    app.open(templateFile);
    log("✅ Template aperto");
    
    // ============================================
    // 4. TROVA COMP
    // ============================================
    log("\n🔍 Cerco MASTER_RENDER...");
    var comp = null;
    for (var i = 1; i <= app.project.numItems; i++) {
        var item = app.project.item(i);
        if (item instanceof CompItem && item.name === "MASTER_RENDER") {
            comp = item;
            break;
        }
    }
    
    if (!comp) throw new Error("MASTER_RENDER non trovata");
    log("✅ MASTER_RENDER trovata");
    
    // ============================================
    // 5. VIDEO INPUT (MULTI-VIDEO SUPPORT)
    // ============================================
    log("\n🔍 Gestione video input...");

    var grpInputVideo = null;
    for (var i = 1; i <= comp.numLayers; i++) {
        var lname = comp.layer(i).name;
        if (lname === "GRP_INPUT_VIDEO" || lname === "GRP_INPUT_VIDEO ") {
            grpInputVideo = comp.layer(i);
            break;
        }
    }

    if (!grpInputVideo) throw new Error("GRP_INPUT_VIDEO non trovato");
    log("✅ GRP_INPUT_VIDEO trovato");

    // Supporta array o singolo video
    var videoPaths = [];
    if (jobData.input_video_paths && jobData.input_video_paths.length > 0) {
        videoPaths = jobData.input_video_paths;
    } else if (jobData.video_urls && jobData.video_urls.length > 0) {
        videoPaths = jobData.video_urls;
    } else if (jobData.input_video_path) {
        videoPaths = [jobData.input_video_path];
    }

    log("Video da importare: " + videoPaths.length);

    var finalDuration = 10; // Default fallback

    if (videoPaths.length > 0 && grpInputVideo.source instanceof CompItem) {
        var videoComp = grpInputVideo.source;
        
        // Trova layer input.mp4
        var inputLayer = null;
        for (var i = 1; i <= videoComp.numLayers; i++) {
            if (videoComp.layer(i).name === "input.mp4") {
                inputLayer = videoComp.layer(i);
                break;
            }
        }
        
        if (!inputLayer) {
            log("⚠️ Layer input.mp4 non trovato, uso il primo layer");
            inputLayer = videoComp.layer(1);
        }
        
        // CASO 1: Singolo video
        if (videoPaths.length === 1) {
            log("📹 Modalità: Singolo video");
            var videoFile = new File(videoPaths[0]);
            
            if (videoFile.exists) {
                var importOptions = new ImportOptions(videoFile);
                var newFootage = app.project.importFile(importOptions);
                
                inputLayer.replaceSource(newFootage, false);
                log("✅ Video sostituito: " + videoPaths[0]);
                
                // Scala e centra
                try {
                    var compWidth = videoComp.width;
                    var compHeight = videoComp.height;
                    var videoWidth = newFootage.width;
                    var videoHeight = newFootage.height;
                    
                    var compRatio = compWidth / compHeight;
                    var videoRatio = videoWidth / videoHeight;
                    
                    // Cover (riempi)
                    var scaleToFill = (videoRatio > compRatio) 
                        ? (compHeight / videoHeight) * 100 
                        : (compWidth / videoWidth) * 100;
                    
                    inputLayer.property("Transform").property("Scale").setValue([scaleToFill, scaleToFill]);
                    inputLayer.property("Transform").property("Position").setValue([compWidth/2, compHeight/2]);
                    
                    log("✅ Video scalato (cover): " + scaleToFill.toFixed(2) + "%");
                } catch(e) {
                    log("⚠️ Errore scaling: " + e.toString());
                }
                
                // ✅ DURATA BASATA SUL VIDEO
                finalDuration = newFootage.duration;
                log("✅ Durata video: " + finalDuration.toFixed(2) + "s");
                
            } else {
                log("❌ Video non trovato: " + videoPaths[0]);
            }
            
        } else {
            // CASO 2: Multi-video (sequenza)
            log("📹 Modalità: Multi-video (" + videoPaths.length + " clip)");
            
            // Importa tutti i video
            var footages = [];
            var totalDuration = 0;
            
            for (var v = 0; v < videoPaths.length; v++) {
                var videoFile = new File(videoPaths[v]);
                
                if (videoFile.exists) {
                    var importOptions = new ImportOptions(videoFile);
                    var footage = app.project.importFile(importOptions);
                    footages.push(footage);
                    totalDuration += footage.duration;
                    log(" [" + (v+1) + "] " + footage.duration.toFixed(2) + "s - " + videoPaths[v]);
                } else {
                    log(" [" + (v+1) + "] ❌ Non trovato: " + videoPaths[v]);
                }
            }
            
            if (footages.length === 0) throw new Error("Nessun video valido trovato");
            
            // ✅ DURATA BASATA SULLA SOMMA
            finalDuration = totalDuration;
            log("✅ Durata totale: " + finalDuration.toFixed(2) + "s");
            
            // Crea precomp per sequenza
            var videoSeqComp = app.project.items.addComp(
                "VIDEO_SEQUENCE_" + jobData.job_id,
                videoComp.width,
                videoComp.height,
                videoComp.pixelAspect,
                totalDuration,
                videoComp.frameRate
            );
            
            var currentTime = 0;
            
            for (var v = 0; v < footages.length; v++) {
                var vLayer = videoSeqComp.layers.add(footages[v]);
                var clipDuration = footages[v].duration;
                
                vLayer.startTime = currentTime;
                vLayer.inPoint = currentTime;
                vLayer.outPoint = currentTime + clipDuration;
                
                // Scala cover
                try {
                    var compRatio = videoSeqComp.width / videoSeqComp.height;
                    var videoRatio = footages[v].width / footages[v].height;
                    
                    var scaleToFill = (videoRatio > compRatio) 
                        ? (videoSeqComp.height / footages[v].height) * 100 
                        : (videoSeqComp.width / footages[v].width) * 100;
                    
                    vLayer.property("Transform").property("Scale").setValue([scaleToFill, scaleToFill]);
                    vLayer.property("Transform").property("Position").setValue([videoSeqComp.width/2, videoSeqComp.height/2]);
                } catch(e) {}
                
                log(" Clip " + (v+1) + ": " + currentTime.toFixed(2) + "s → " + (currentTime + clipDuration).toFixed(2) + "s");
                
                currentTime += clipDuration;
            }
            
            // Sostituisci con la sequenza
            inputLayer.replaceSource(videoSeqComp, false);
            
            log("✅ Sequenza video creata");
        }
    }

    // ✅ APPLICA DURATA FINALE A TUTTE LE COMP
    log("\n⏱️ Impostazione durata finale: " + finalDuration.toFixed(2) + "s");

    // Imposta durata comp video
    if (grpInputVideo.source instanceof CompItem) {
        grpInputVideo.source.duration = finalDuration;
        log(" ✅ VIDEO_INPUT_COMP: " + finalDuration.toFixed(2) + "s");
    }

    // Imposta durata MASTER_RENDER
    comp.duration = finalDuration;
    log(" ✅ MASTER_RENDER: " + finalDuration.toFixed(2) + "s");

    // ✅ ESTENDI TUTTI I LAYER AL TEMPO FINALE
    log("\n🔧 Estensione layer MASTER_RENDER...");
    for (var i = 1; i <= comp.numLayers; i++) {
        var layer = comp.layer(i);
        
        try {
            // Estendi outPoint solo se il layer è più corto della comp
            if (layer.outPoint < finalDuration) {
                layer.outPoint = finalDuration;
                log(" ✅ Esteso: " + layer.name + " → " + finalDuration.toFixed(2) + "s");
            }
            
            // Se il layer è una precomp, estendi anche quella
            if (layer.source instanceof CompItem) {
                var subComp = layer.source;
                if (subComp.duration < finalDuration) {
                    subComp.duration = finalDuration;
                    
                    // Estendi anche i layer INTERNI della precomp
                    for (var j = 1; j <= subComp.numLayers; j++) {
                        var subLayer = subComp.layer(j);
                        if (subLayer.outPoint < finalDuration) {
                            subLayer.outPoint = finalDuration;
                        }
                    }
                    
                    log(" ✅ Precomp estesa: " + subComp.name);
                }
            }
        } catch(e) {
            log(" ⚠️ Errore estendendo " + layer.name + ": " + e.toString());
        }
    }

    log("✅ Durata finale applicata");

    
    // ============================================
    // 6. SELEZIONE LAYOUT TESTI
    // ============================================
    log("\n🔍 Gestione layout testi...");

    var textLayout = jobData.text_layout || 'center';
    log("Layout richiesto: " + textLayout);

    var grpTextLayouts = null;
    for (var i = 1; i <= comp.numLayers; i++) {
        if (comp.layer(i).name === "GRP_TEXT_LAYOUTS") {
            grpTextLayouts = comp.layer(i);
            break;
        }
    }

    if (!grpTextLayouts) {
        log("⚠️ GRP_TEXT_LAYOUTS non trovato, salto selezione layout");
    } else {
        log("✅ GRP_TEXT_LAYOUTS trovato (tipo: " + grpTextLayouts.toString() + ")");
        
        // ✅ VERIFICA SE È UNA PRECOMP
        if (grpTextLayouts.source instanceof CompItem) {
            var layoutsComp = grpTextLayouts.source;
            log("✅ GRP_TEXT_LAYOUTS è una precomp con " + layoutsComp.numLayers + " layer");
            
            // ✅ LISTA TUTTI I LAYER
            log("\n📋 Layer disponibili in GRP_TEXT_LAYOUTS:");
            for (var j = 1; j <= layoutsComp.numLayers; j++) {
                var ly = layoutsComp.layer(j);
                log("  [" + j + "] " + ly.name + " (enabled: " + ly.enabled + ")");
            }
            
            // Mappa layout → nome layer
            var layoutMap = {
                'center': 'TXT_LAYOUT_CENTER',
                'top_bottom': 'TXT_LAYOUT_TOP_BOTTOM',
                'bottom': 'TXT_LAYOUT_BOTTOM'
            };
            
            var targetLayerName = layoutMap[textLayout] || 'TXT_LAYOUT_CENTER';
            log("\n🎯 Target layer: " + targetLayerName);
            
            // ✅ DISABILITA TUTTI
            log("\n🔧 Disabilitazione layer...");
            for (var j = 1; j <= layoutsComp.numLayers; j++) {
                var ly = layoutsComp.layer(j);
                var layerName = ly.name;
                
                // ✅ CONTROLLA SE IL NOME CONTIENE "TXT_LAYOUT"
                if (layerName.indexOf("TXT_LAYOUT") !== -1 || 
                    layerName.indexOf("LAYOUT") !== -1 ||
                    layerName.indexOf("CENTER") !== -1 ||
                    layerName.indexOf("TOP_BOTTOM") !== -1 ||
                    layerName.indexOf("BOTTOM") !== -1) {
                    
                    ly.enabled = false;
                    log(" ❌ Disabilitato: " + layerName);
                }
            }
            
            // ✅ ABILITA SOLO IL TARGET
            log("\n🔧 Abilitazione target...");
            var targetFound = false;
            
            for (var j = 1; j <= layoutsComp.numLayers; j++) {
                var ly = layoutsComp.layer(j);
                var layerName = ly.name;
                
                // ✅ MATCHING PIÙ FLESSIBILE
                var isTarget = false;
                
                if (textLayout === 'center' && (layerName.indexOf("CENTER") !== -1 || layerName === targetLayerName)) {
                    isTarget = true;
                } else if (textLayout === 'top_bottom' && (layerName.indexOf("TOP_BOTTOM") !== -1 || layerName === targetLayerName)) {
                    isTarget = true;
                } else if (textLayout === 'bottom' && layerName.indexOf("BOTTOM") !== -1 && layerName.indexOf("TOP_BOTTOM") === -1) {
                    isTarget = true;
                }
                
                if (isTarget) {
                    ly.enabled = true;
                    targetFound = true;
                    log(" ✅✅✅ ABILITATO: " + layerName);
                }
            }
            
            if (!targetFound) {
                log(" ⚠️⚠️⚠️ TARGET NON TROVATO: " + targetLayerName);
                log(" 🔍 Provo a cercare per nome parziale...");
                
                // ✅ FALLBACK: cerca per nome parziale
                for (var j = 1; j <= layoutsComp.numLayers; j++) {
                    var ly = layoutsComp.layer(j);
                    if (ly.name.toLowerCase().indexOf(textLayout.toLowerCase()) !== -1) {
                        ly.enabled = true;
                        log(" ✅ ABILITATO (fallback): " + ly.name);
                        targetFound = true;
                        break;
                    }
                }
            }
            
            if (!targetFound) {
                log(" ❌❌❌ ERRORE: Nessun layer trovato per layout '" + textLayout + "'");
            }
            
        } else {
            log("⚠️ GRP_TEXT_LAYOUTS non è una precomp, è: " + grpTextLayouts.source.toString());
            
            // ✅ ALTERNATIVA: Potrebbe essere un gruppo diretto
            log("🔍 Provo a gestire come gruppo di layer...");
            
            // Cerca layer nella MASTER_RENDER
            log("\n📋 Layer disponibili in MASTER_RENDER:");
            for (var i = 1; i <= comp.numLayers; i++) {
                var ly = comp.layer(i);
                log("  [" + i + "] " + ly.name);
                
                // Se trova layer con layout nel nome
                if (ly.name.indexOf("LAYOUT") !== -1) {
                    if (ly.name.toLowerCase().indexOf(textLayout.toLowerCase()) !== -1) {
                        ly.enabled = true;
                        log(" ✅ ABILITATO: " + ly.name);
                    } else {
                        ly.enabled = false;
                        log(" ❌ DISABILITATO: " + ly.name);
                    }
                }
            }
        }
    }

    
    // ============================================
    // 7. RENDER
    // ============================================
    log("\n🎬 RENDER...");
    var outputFile = new File(jobData.output_path);
    var outputFolder = new Folder(outputFile.parent.fsName);
    if (!outputFolder.exists) outputFolder.create();
    
    var renderQueue = app.project.renderQueue;
    var renderItem = renderQueue.items.add(comp);
    var outputModule = renderItem.outputModule(1);
    outputModule.file = outputFile;
    
    try {
        outputModule.applyTemplate("H.264 - Match Render Settings - 15 Mbps");
        outputModule.file = outputFile;
        log("✅ Template H.264");
    } catch(e) {
        log("⚠️ Template H.264 non trovato, uso default");
    }
    
    log("📁 Output: " + jobData.output_path);
    log("🚀 Rendering...");
    
    renderQueue.render();
    
    log("\n✅✅✅ RENDER COMPLETATO!");
    log("🎬 Video salvato in: " + jobData.output_path);
    
    // ============================================
    // 8. CHIUSURA PULITA
    // ============================================
    log("\n🚪 Chiusura After Effects...");
    try {
        app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES);
        log("✅ Progetto chiuso");
    } catch(e) {
        log("⚠️ Errore chiusura progetto: " + e.toString());
    }
    
    log("=== FINE ===");
    $.sleep(1000);
    
    try {
        app.quit();
        log("✅ After Effects chiuso");
    } catch(e) {
        log("⚠️ Errore quit: " + e.toString());
    }
    
} catch(err) {
    log("\n❌❌❌ ERRORE: " + err.toString());
    log("Stack: " + (err.line ? ("Linea " + err.line) : "N/A"));
    alert("ERRORE RENDERING:\n" + err.toString() + "\n\nVedi log:\n" + LOG_FILE_PATH);
    throw err;
}

})();
