// ============================================
// SCRIPT: render_alifunny.jsx
// Template: AliExpress Ali Funny (Box Domanda Instagram Style)
// Fix: Trim spazi + Video 100% + Stretch 9.5s
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
    logFile.write("ALIFUNNY LOG - " + new Date().toString() + "\n");
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
    log(" box_title: " + (jobData.box_title || 'N/A'));
    log(" box_question: " + (jobData.box_question || 'N/A'));
    log(" hero_solution: " + (jobData.hero_solution || 'N/A'));
    log(" product_name: " + (jobData.product_name || 'N/A'));
    log(" season: " + (jobData.season || 'inverno'));
    
    // ============================================
    // 2. CHIUDI PROGETTI APERTI
    // ============================================
    log("\n🔍 Chiusura progetti aperti...");
    try {
        if (app.project) {
            log("Chiudo progetto corrente...");
            app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES);
            log("✅ Progetto chiuso");
        }
    } catch(e) {
        log("⚠️ Ignoro errore chiusura: " + e.toString());
    }
    
    // ============================================
    // 3. APRI TEMPLATE
    // ============================================
    log("\n🔍 Apro template...");
    var templateFile = new File(jobData.template_aep_path);
    if (!templateFile.exists) throw new Error("Template non trovato: " + jobData.template_aep_path);
    
    log("📁 Path: " + templateFile.fsName);
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
    // 5. VIDEO INPUT + STRETCH A 9.5s
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
    
    // Supporta vari formati video path
    var videoPathToUse = null;
    if (jobData.input_video_paths && jobData.input_video_paths.length > 0) {
        videoPathToUse = jobData.input_video_paths[0];
    } else if (jobData.video_urls && jobData.video_urls.length > 0) {
        videoPathToUse = jobData.video_urls[0];
    } else if (jobData.input_video_path) {
        videoPathToUse = jobData.input_video_path;
    }
    
    log("Video path da usare: " + (videoPathToUse || "NESSUNO"));
    
    // Sostituisci video
    if (grpInputVideo.source instanceof CompItem && videoPathToUse) {
        var videoComp = grpInputVideo.source;
        var inputLayer = null;
        
        for (var i = 1; i <= videoComp.numLayers; i++) {
            if (videoComp.layer(i).name === "input.mp4") {
                inputLayer = videoComp.layer(i);
                break;
            }
        }
        
        if (inputLayer) {
            var videoFile = new File(videoPathToUse);
            
            if (videoFile.exists) {
                log("📹 Importo video: " + videoPathToUse);
                var importOptions = new ImportOptions(videoFile);
                var newFootage = app.project.importFile(importOptions);
                
                inputLayer.replaceSource(newFootage, false);
                log("✅ Video sostituito");
                
                // ============================================
                // DURATA MINIMA: 9.5s (con stretch se necessario)
                // ============================================
                var MIN_DURATION = 9.5;
                var videoDuration = newFootage.duration;
                var targetDuration = MIN_DURATION;
                var stretchPercentage = 100.0;
                
                log("📏 Durata originale video: " + videoDuration.toFixed(2) + "s");
                
                if (videoDuration < MIN_DURATION) {
                    stretchPercentage = (targetDuration / videoDuration) * 100.0;
                    log("⚠️ Video corto, applico stretch: " + stretchPercentage.toFixed(1) + "%");
                } else {
                    targetDuration = videoDuration;
                    log("✅ Video già lungo, nessuno stretch");
                }
                
                inputLayer.stretch = stretchPercentage;
                inputLayer.startTime = 0;
                inputLayer.inPoint = 0;
                inputLayer.outPoint = targetDuration;
                
                log("✅ Durata finale video: " + targetDuration.toFixed(2) + "s");
                log("   Stretch applicato: " + stretchPercentage.toFixed(1) + "%");
                
                // ============================================
                // SCALING: 100% FISSO (NO CROP, NO ZOOM)
                // ============================================
                try {
                    var compWidth = videoComp.width;
                    var compHeight = videoComp.height;
                    var videoWidth = newFootage.width;
                    var videoHeight = newFootage.height;
                    
                    // FORZA 100% - nessun crop
                    inputLayer.property("Transform").property("Scale").setValue([100, 100]);
                    inputLayer.property("Transform").property("Position").setValue([compWidth/2, compHeight/2]);
                    
                    log("✅ Video scalato: 100.00% (fisso - no crop)");
                    log("   Comp: " + compWidth + "x" + compHeight);
                    log("   Video: " + videoWidth + "x" + videoHeight);
                } catch(e) {
                    log("⚠️ Errore scaling: " + e.toString());
                }
                
                comp.duration = targetDuration;
                log("✅ Durata comp master: " + comp.duration.toFixed(2) + "s");
                
            } else {
                log("❌ Video non trovato: " + videoPathToUse);
            }
        } else {
            log("⚠️ Layer input.mp4 non trovato in GRP_INPUT_VIDEO");
        }
    } else {
        log("⚠️ Nessun video da sostituire o GRP_INPUT_VIDEO non è precomp");
    }
    
    // ============================================
    // 6. BOX DOMANDA (TXT_HERO_TAG)
    // ============================================
    log("\n🔍 Gestione Box Domanda (TXT_HERO_TAG)...");
    
    var grpHero = null;
    for (var i = 1; i <= comp.numLayers; i++) {
        if (comp.layer(i).name === "GRP_HERO") {
            grpHero = comp.layer(i);
            break;
        }
    }
    
    if (!grpHero) throw new Error("GRP_HERO non trovato");
    log("✅ GRP_HERO trovato");
    
    if (grpHero.source instanceof CompItem) {
        var heroComp = grpHero.source;
        
        var txtHeroTag = null;
        for (var i = 1; i <= heroComp.numLayers; i++) {
            if (heroComp.layer(i).name === "TXT_HERO_TAG") {
                txtHeroTag = heroComp.layer(i);
                break;
            }
        }
        
        if (txtHeroTag && txtHeroTag.source instanceof CompItem) {
            var tagComp = txtHeroTag.source;
            log("✅ TXT_HERO_TAG trovato (precomp)");
            log("   Numero layer: " + tagComp.numLayers);
            
            // ============================================
            // A. Titolo Box (TAG_TEXT con TRIM SPAZI)
            // ============================================
            if (jobData.box_title) {
                var tagText = null;
                
                // Cerca con trim spazi
                for (var i = 1; i <= tagComp.numLayers; i++) {
                    var layer = tagComp.layer(i);
                    if (!layer) continue;
                    
                    var layerNameTrimmed = layer.name.replace(/^\s+|\s+$/g, '');
                    
                    if (layerNameTrimmed === "TAG_TEXT" && layer.property("Source Text")) {
                        tagText = layer;
                        log("✅ TAG_TEXT trovato: '" + layer.name + "' (trimmed: '" + layerNameTrimmed + "')");
                        break;
                    }
                }
                
                if (tagText) {
                    try {
                        var textProp = tagText.property("Source Text");
                        var textDoc1 = textProp.value;
                        textDoc1.text = jobData.box_title;
                        textProp.setValue(textDoc1);
                        log("✅✅ Titolo Box impostato: '" + jobData.box_title + "'");
                    } catch(e) {
                        log("❌ Errore impostazione TAG_TEXT: " + e.toString());
                    }
                } else {
                    log("❌ TAG_TEXT non trovato!");
                }
            }
            
            // ============================================
            // B. Domanda (TAG_QUESTION_TEXT)
            // ============================================
            if (jobData.box_question) {
                var questionText = null;
                
                for (var i = 1; i <= tagComp.numLayers; i++) {
                    var layer = tagComp.layer(i);
                    if (!layer) continue;
                    
                    var layerNameTrimmed = layer.name.replace(/^\s+|\s+$/g, '');
                    
                    if (layerNameTrimmed === "TAG_QUESTION_TEXT" && layer.property("Source Text")) {
                        questionText = layer;
                        log("✅ TAG_QUESTION_TEXT trovato");
                        break;
                    }
                }
                
                if (questionText) {
                    try {
                        var textProp2 = questionText.property("Source Text");
                        var textDoc2 = textProp2.value;
                        textDoc2.text = jobData.box_question;
                        textProp2.setValue(textDoc2);
                        log("✅✅ Domanda impostata: '" + jobData.box_question + "'");
                    } catch(e) {
                        log("❌ Errore impostazione TAG_QUESTION_TEXT: " + e.toString());
                    }
                }
            }
        } else {
            log("⚠️ TXT_HERO_TAG non trovato o non è precomp");
        }
        
        // ============================================
        // 7. SOLUZIONE/RISPOSTA (TXT_HERO_TITLE)
        // ============================================
        log("\n🔍 Gestione Soluzione (TXT_HERO_TITLE)...");
        
        var txtHeroTitle = null;
        for (var i = 1; i <= heroComp.numLayers; i++) {
            if (heroComp.layer(i).name === "TXT_HERO_TITLE") {
                txtHeroTitle = heroComp.layer(i);
                break;
            }
        }
        
        if (txtHeroTitle && txtHeroTitle.source instanceof CompItem) {
            var titleComp = txtHeroTitle.source;
            log("✅ TXT_HERO_TITLE trovato (precomp)");
            log("   Numero layer: " + titleComp.numLayers);
            
            // DEBUG: Lista layer
            log("🔍 DEBUG - Layer in TXT_HERO_TITLE:");
            for (var i = 1; i <= titleComp.numLayers; i++) {
                var layer = titleComp.layer(i);
                if (layer) {
                    log("   [" + i + "] '" + layer.name + "' (type: " + (layer.property("Source Text") ? "TEXT" : "OTHER") + ")");
                }
            }
            
            if (jobData.hero_solution) {
                var heroLineText = null;
                
                // Cerca con trim spazi
                for (var i = 1; i <= titleComp.numLayers; i++) {
                    var layer = titleComp.layer(i);
                    if (!layer) continue;
                    
                    var layerNameTrimmed = layer.name.replace(/^\s+|\s+$/g, '');
                    
                    if (layerNameTrimmed === "HERO_LINE_TEXT" && layer.property("Source Text")) {
                        heroLineText = layer;
                        log("✅ HERO_LINE_TEXT trovato: '" + layer.name + "' (trimmed: '" + layerNameTrimmed + "')");
                        break;
                    }
                }
                
                if (heroLineText) {
                    try {
                        log("🔍 Tentativo impostazione HERO_LINE_TEXT...");
                        var textProp3 = heroLineText.property("Source Text");
                        var textDoc3 = textProp3.value;
                        log("   Testo attuale: '" + textDoc3.text + "'");
                        
                        textDoc3.text = jobData.hero_solution;
                        textProp3.setValue(textDoc3);
                        
                        var textDocVerify = textProp3.value;
                        log("✅✅ Soluzione impostata: '" + jobData.hero_solution + "'");
                        log("   Verifica: '" + textDocVerify.text + "'");
                    } catch(e) {
                        log("❌ Errore impostazione HERO_LINE_TEXT: " + e.toString());
                    }
                } else {
                    log("❌ HERO_LINE_TEXT non trovato!");
                }
            }
        } else {
            log("⚠️ TXT_HERO_TITLE non trovato o non è precomp");
        }
    } else {
        log("⚠️ GRP_HERO non è precomp");
    }
    
    // ============================================
    // 8. NOME PRODOTTO (GRP_LABEL)
    // ============================================
    log("\n🔍 Gestione Nome Prodotto (GRP_LABEL)...");
    
    var grpLabel = null;
    for (var i = 1; i <= comp.numLayers; i++) {
        if (comp.layer(i).name === "GRP_LABEL") {
            grpLabel = comp.layer(i);
            break;
        }
    }
    
    if (grpLabel && grpLabel.source instanceof CompItem) {
        var labelComp = grpLabel.source;
        log("✅ GRP_LABEL trovato");
        
        if (jobData.product_name) {
            var productNameText = null;
            
            for (var i = 1; i <= labelComp.numLayers; i++) {
                var layer = labelComp.layer(i);
                if (!layer) continue;
                
                var layerNameTrimmed = layer.name.replace(/^\s+|\s+$/g, '');
                
                if (layerNameTrimmed === "PRODUCT_NAME_TEXT" && layer.property("Source Text")) {
                    productNameText = layer;
                    log("✅ PRODUCT_NAME_TEXT trovato");
                    break;
                }
            }
            
            if (productNameText) {
                try {
                    var textProp4 = productNameText.property("Source Text");
                    var textDoc4 = textProp4.value;
                    textDoc4.text = jobData.product_name;
                    textProp4.setValue(textDoc4);
                    log("✅✅ Nome Prodotto impostato: '" + jobData.product_name + "'");
                } catch(e) {
                    log("❌ Errore impostazione PRODUCT_NAME_TEXT: " + e.toString());
                }
            }
        }
    } else {
        log("⚠️ GRP_LABEL non trovato o non è precomp");
    }
    
    // ============================================
    // 9. OUTRO STAGIONALE
    // ============================================
    log("\n🔍 Gestione Outro...");
    
    var grpOutros = null;
    for (var i = 1; i <= comp.numLayers; i++) {
        if (comp.layer(i).name === "GRP_OUTROS") {
            grpOutros = comp.layer(i);
            break;
        }
    }
    
    if (grpOutros && grpOutros.source instanceof CompItem) {
        var outroComp = grpOutros.source;
        log("✅ GRP_OUTROS trovato");
        
        var season = jobData.season || 'inverno';
        var seasonMap = {
            'inverno': 'WINTER',
            'autunno': 'AUTUMN',
            'primavera': 'SPRING',
            'estate': 'SUMMER'
        };
        var targetKeyword = seasonMap[season.toLowerCase()] || 'WINTER';
        var targetLayerName = "MOD_OUTRO_" + targetKeyword;
        
        log(" Stagione: " + season + " → " + targetLayerName);
        
        for (var j = 1; j <= outroComp.numLayers; j++) {
            var ly = outroComp.layer(j);
            if (ly.name.indexOf("MOD_OUTRO_") !== -1) {
                ly.enabled = false;
            }
        }
        
        var outroLayer = null;
        try {
            outroLayer = outroComp.layer(targetLayerName);
        } catch(e) {
            log(" ⚠️ Layer " + targetLayerName + " non trovato!");
        }
        
        if (outroLayer) {
            outroLayer.enabled = true;
            log(" ✅ Attivato: " + outroLayer.name);
            
            var outroDuration = 3.0;
            if (outroLayer.source && outroLayer.source instanceof CompItem) {
                outroDuration = outroLayer.source.duration;
            } else {
                outroDuration = outroLayer.outPoint - outroLayer.inPoint;
            }
            log(" Durata outro: " + outroDuration.toFixed(2) + "s");
            
            outroLayer.startTime = 0;
            outroLayer.inPoint = 0;
            outroLayer.outPoint = outroComp.duration;
            
            grpOutros.enabled = true;
            var outroStart = comp.duration - outroDuration;
            
            if (outroStart < 0) {
                grpOutros.startTime = 0;
                grpOutros.inPoint = 0;
                grpOutros.outPoint = comp.duration;
                log(" ⚠️ Outro più lungo del video");
            } else {
                grpOutros.startTime = outroStart;
                grpOutros.inPoint = outroStart;
                grpOutros.outPoint = comp.duration;
            }
            
            log(" ✅ Outro posizionato: " + grpOutros.startTime.toFixed(2) + "s → " + grpOutros.outPoint.toFixed(2) + "s");
        }
    } else {
        log("⚠️ GRP_OUTROS non trovato o non è precomp");
    }
    
    // ============================================
    // 10. RENDER
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
    // 11. CHIUSURA PULITA
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
