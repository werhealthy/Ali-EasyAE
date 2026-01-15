
// render_script.jsx - VERSIONE FINALE CON JSON MANUALE

(function() {

var statusPath = "";

function log(msg) {
    var f = new File("/Users/francesco.cerisano/Documents/GitHub/Ali-EasyAE/_temp_data/production_log.txt");
    f.open("a");
    f.writeln("[" + new Date().toTimeString().substring(0,8) + "] " + msg);
    f.close();
}

// Funzione per convertire oggetto in JSON (compatibile ES3)
function toJSON(obj) {
    var parts = [];
    for (var key in obj) {
        if (obj.hasOwnProperty(key)) {
            var value = obj[key];
            var jsonValue;
            
            if (typeof value === "string") {
                jsonValue = '"' + value.replace(/"/g, '\\"') + '"';
            } else if (typeof value === "number" || typeof value === "boolean") {
                jsonValue = String(value);
            } else if (value === null) {
                jsonValue = "null";
            } else {
                jsonValue = '""';
            }
            
            parts.push('"' + key + '":' + jsonValue);
        }
    }
    return '{' + parts.join(',') + '}';
}

function updateStatus(progress, status, error) {
    if (!statusPath) return;
    try {
        var statusFile = new File(statusPath);
        var statusObj = {
            status: status || "rendering",
            progress: progress || 0,
            started_at: new Date().getTime()
        };
        if (error) statusObj.error = error;
        
        statusFile.open("w");
        statusFile.write(toJSON(statusObj));
        statusFile.close();
        log("Status aggiornato: " + progress + "% - " + status);
    } catch(e) {
        log("Errore update status: " + e.toString());
    }
}

try {
    // --- 1. CONFIGURAZIONE ---
    var baseFolder = "/Users/francesco.cerisano/Documents/GitHub/Ali-EasyAE";
    var jsonPath = baseFolder + "/_temp_data/job_data.json";
    var templatePath = baseFolder + "/_templates/ALIEXPRESS_MASTER.aep";
    
    var FONT_BOLD = "AliExpresssans-Blod";
    var FONT_REGULAR = "AliExpresssans-Regular";
    var SPAZIATURA_Y = 90;
    var DELAY_TEMPO = 0.2;
    var NOME_LIV_HERO = "TEXT_TEMPLATE";
    var NOME_LIV_PROD = "TEXT_FOOTER";

    // --- 2. LETTURA DATI ---
    var jsonFile = new File(jsonPath);
    if (!jsonFile.exists) { 
        alert("ERRORE: JSON non trovato"); 
        return; 
    }

    jsonFile.open("r");
    var rawJson = jsonFile.read();
    jsonFile.close();

    var data;
    try {
        data = eval("(" + rawJson + ")");
    } catch(e) {
        alert("ERRORE NEL JSON: " + e.toString());
        return;
    }
    
    // Imposta status path basato su job_id
    statusPath = baseFolder + "/_temp_data/status_" + data.job_id + ".json";
    log("JSON caricato: " + data.product_name + ", job_id: " + data.job_id);
    
    updateStatus(15, "rendering");

    // --- 3. APERTURA PROGETTO ---
    var tplFile = new File(templatePath);
    if (!tplFile.exists) { 
        alert("ERRORE: File AEP non trovato in " + templatePath); 
        updateStatus(0, "failed", "Template AEP non trovato");
        return; 
    }

    if (app.project && app.project.file && app.project.file.toString() !== templatePath.toString()) {
        app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES);
    }

    app.open(tplFile);
    var comp = app.project.activeItem || app.project.item(1);
    
    updateStatus(25, "rendering");

    // --- 4. SOSTITUZIONE VIDEO ---
    if (data.video_path) {
        log("Inizio sostituzione video: " + data.video_path);
        updateStatus(30, "rendering");
        
        var videoLayerNames = ["INPUT_VIDEO", "input.mp4", "input", "VIDEO_BG", "background"];
        var videoLayer = null;
        
        for (var v = 0; v < videoLayerNames.length; v++) {
            try {
                videoLayer = comp.layer(videoLayerNames[v]);
                if (videoLayer) {
                    log("Trovato layer video: " + videoLayerNames[v]);
                    break;
                }
            } catch(e) {}
        }
        
        if (videoLayer) {
            try {
                var newVideoFile = new File(data.video_path);
                
                if (newVideoFile.exists) {
                    var importedVideo = app.project.importFile(new ImportOptions(newVideoFile));
                    videoLayer.replaceSource(importedVideo, false);
                    log("Video sostituito con successo!");
                    updateStatus(40, "rendering");
                } else {
                    log("File video non trovato: " + data.video_path);
                }
            } catch(errVideo) {
                log("Errore sostituzione video: " + errVideo.toString());
            }
        } else {
            log("Nessun layer video trovato nel template");
        }
    }

    // --- 5. PRODOTTO ---
    updateStatus(45, "rendering");
    var layerProdotto = comp.layer(NOME_LIV_PROD);
    if (layerProdotto) {
        var prop = layerProdotto.property("Source Text");
        var doc = prop.value;
        doc.text = data.product_name ? String(data.product_name) : "NOME PRODOTTO";
        prop.setValue(doc);
        log("Prodotto scritto: " + doc.text);
    }

    // --- 6. HERO TEXT ---
    updateStatus(50, "rendering");
    var heroLayer = comp.layer(NOME_LIV_HERO);
    if (!heroLayer) {
        alert("ERRORE: Layer TEXT_TEMPLATE non trovato!");
        updateStatus(0, "failed", "Layer TEXT_TEMPLATE non trovato");
        return;
    }

    if (!data.hero_lines || data.hero_lines.length === 0) {
        alert("ATTENZIONE: Nessuna hero_line nel JSON!");
        updateStatus(0, "failed", "Nessuna hero_line");
        return;
    }

    log("Inizio generazione " + data.hero_lines.length + " righe");
    
    var startPos = heroLayer.position.value;
    var startTime = heroLayer.startTime;
    heroLayer.enabled = false;

    for (var i = 0; i < data.hero_lines.length; i++) {
        var lineData = data.hero_lines[i];
        
        var textContent = "";
        var useBold = true;
        
        if (typeof lineData === "string") {
            textContent = lineData;
        } else if (typeof lineData === "object" && lineData !== null) {
            textContent = lineData.text || "";
            if (lineData.is_bold === false) useBold = false;
        }

        log("Riga " + (i+1) + ": " + textContent);

        var newLayer = heroLayer.duplicate();
        newLayer.name = "GEN_RIGA_" + (i + 1);
        newLayer.enabled = true;

        var textProp = newLayer.property("Source Text");
        
        try {
            var textDoc = textProp.value;
            textDoc.text = textContent;
            textDoc.font = useBold ? FONT_BOLD : FONT_REGULAR;
            textProp.setValue(textDoc);
        } catch(errFont) {
            log("Font fallito, uso fallback");
            var fallbackDoc = textProp.value;
            fallbackDoc.text = textContent;
            textProp.setValue(fallbackDoc);
        }

        newLayer.position.setValue([startPos[0], startPos[1] + (i * SPAZIATURA_Y)]);
        newLayer.startTime = startTime + (i * DELAY_TEMPO);

        if (newLayer.trackMatteType != TrackMatteType.NO_TRACK_MATTE) {
            newLayer.trackMatteType = TrackMatteType.NO_TRACK_MATTE;
        }

        var myMasks = newLayer.property("Masks");
        if (myMasks && myMasks.numProperties > 0) {
            for (var m = myMasks.numProperties; m >= 1; m--) {
                myMasks.property(m).remove();
            }
        }
        
        var progressRighe = 50 + Math.floor((i / data.hero_lines.length) * 15);
        updateStatus(progressRighe, "rendering");
    }

    log("Tutte le righe create. Inizio render...");
    updateStatus(70, "rendering");

    // --- 7. RENDER ---
    while (app.project.renderQueue.numItems > 0) {
        app.project.renderQueue.item(1).remove();
    }

    var rqItem = app.project.renderQueue.items.add(comp);
    var outputModule = rqItem.outputModule(1);
    
    var outputPath = data.output_path || (baseFolder + "/_output/output_" + data.job_id + ".mov");
    outputModule.file = new File(outputPath);
    
    log("Render avviato: " + outputPath);
    updateStatus(75, "rendering");
    
    app.project.renderQueue.render();
    
    log("Render completato!");
    updateStatus(100, "completed");
    
    // Scrivi status finale con path /api/output/
    var finalStatus = new File(statusPath);
    finalStatus.open("w");
    var finalVideoName = "output_" + data.job_id + ".mp4";
    var finalObj = {
        status: "completed",
        progress: 100,
        output_path: "/api/output/" + finalVideoName,
        completed_at: new Date().getTime()
    };
    finalStatus.write(toJSON(finalObj));
    finalStatus.close();
    
    log("Status finale scritto con output_path: /api/output/" + finalVideoName);
    
    // *** FIX: CHIUDI PROGETTO E QUIT ***
    app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES);
    log("Progetto chiuso senza salvare");
    app.quit();
    log("After Effects chiuso");

} catch (e) {
    var errorMsg = e.toString() + " (Linea: " + e.line + ")";
    alert("ERRORE SCRIPT:\n" + errorMsg);
    log("CRASH: " + errorMsg);
    updateStatus(0, "failed", errorMsg);
}

})();
