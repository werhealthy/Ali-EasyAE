// render_alireal.jsx - FIX BLOCCO

(function() {

var statusPath = "";
var baseFolder = "";

function computeBaseFolder() {
  try {
    var scriptFile = new File($.fileName);
    return scriptFile.parent.parent.fsName;
  } catch(e) {
    return "";
  }
}

function log(msg) {
  try {
    var logPath = baseFolder + "/_temp_data/production_log.txt";
    var f = new File(logPath);
    f.open("a");
    f.writeln("[" + new Date().toTimeString().substring(0,8) + "] [AliReal] " + msg);
    f.close();
  } catch(e) {}
}

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
  } catch(e) {}
}

try {
  log("=== INIZIO SCRIPT ALIREAL ===");
  
  baseFolder = computeBaseFolder();
  if (!baseFolder) {
    throw new Error("Impossibile determinare baseFolder");
  }

  // RICERCA FILE PIÙ RECENTE
  var tempFolder = new Folder(baseFolder + '/_temp_data');
  var files = tempFolder.getFiles('job_data_*.json');
  var jsonPath;

  if (files && files.length > 0) {
    var newest = files[0];
    for (var i = 1; i < files.length; i++) {
      if (files[i].modified > newest.modified) {
        newest = files[i];
      }
    }
    jsonPath = newest.fsName;
  } else {
    jsonPath = baseFolder + '/_temp_data/job_data.json';
  }

  // Costanti
  var FONT_BOLD = "AliExpresssans-Blod";
  var FONT_REGULAR = "AliExpresssans-Regular";
  var SPAZIATURA_Y = 90;
  var DELAY_TEMPO = 0.2;

  // Carica JSON
  var jsonFile = new File(jsonPath);
  if (!jsonFile.exists) {
    throw new Error("JSON non trovato: " + jsonPath);
  }

  jsonFile.open("r");
  var rawJson = jsonFile.read();
  jsonFile.close();

  var data = eval("(" + rawJson + ")");
  if (!data.job_id) {
    data.job_id = 'alireal_' + new Date().getTime();
  }

  statusPath = baseFolder + "/_temp_data/status_" + data.job_id + ".json";
  log("Job ID: " + data.job_id);
  updateStatus(15, "rendering");

  // Template
  var templatePath = data.template_aep_path;
  if (templatePath && templatePath.indexOf('/') !== 0) {
    templatePath = baseFolder + '/' + templatePath;
  }

  var tplFile = new File(templatePath);
  if (!tplFile.exists) {
    throw new Error("Template non trovato: " + templatePath);
  }

  // ✅ CHIUSURA SICURA (NO LOOP)
  log("--- CHIUSURA PROGETTI ---");
  try {
    if (app.project) {
      log("Chiudo progetto corrente...");
      app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES);
      log("✅ Chiuso");
    }
  } catch(e) {
    log("⚠️ Ignoro errore chiusura: " + e.toString());
  }

  // Apertura template
  log("--- APERTURA TEMPLATE ---");
  log("Path: " + tplFile.fsName);
  app.open(tplFile);
  log("✅ Template aperto");
  
  // Trova MASTER_RENDER
  var comp = null;
  for (var i = 1; i <= app.project.items.length; i++) {
    if (app.project.items[i].name === "MASTER_RENDER" && app.project.items[i] instanceof CompItem) {
      comp = app.project.items[i];
      break;
    }
  }

  if (!comp) {
    throw new Error("MASTER_RENDER non trovato!");
  }

  log("✅ Comp: " + comp.name);
  updateStatus(25, "rendering");

  // =====================================================
  // A. VIDEO INPUT
  // =====================================================
  log("--- VIDEO INPUT ---");
  var videoPath = data.input_video_path || data.video_path;
  
  if (videoPath) {
    try {
      var grpVideo = comp.layer("GRP_INPUT_VIDEO");
      var vidFile = new File(videoPath);
      
      if (vidFile.exists) {
        log("Importazione video...");
        var importOpts = new ImportOptions(vidFile);
        var vidItem = app.project.importFile(importOpts);
        
        grpVideo.replaceSource(vidItem, false);
        
        // Auto-fit
        var compRatio = comp.width / comp.height;
        var videoRatio = vidItem.width / vidItem.height;
        var scaleToFill = (videoRatio < compRatio) ? 
          (comp.width / vidItem.width) * 100 : 
          (comp.height / vidItem.height) * 100;
        
        grpVideo.property("Scale").setValue([scaleToFill, scaleToFill]);
        grpVideo.property("Position").setValue([comp.width/2, comp.height/2]);
        
        comp.duration = vidItem.duration;
        grpVideo.startTime = 0;
        grpVideo.inPoint = 0;
        grpVideo.outPoint = vidItem.duration;
        log("✅ Video OK, durata: " + vidItem.duration.toFixed(2) + "s");
      }
    } catch(e) {
      log("💥 Errore video: " + e.toString());
    }
  }
  
  updateStatus(40, "rendering");

  // =====================================================
  // B. HERO TEXT
  // =====================================================
  log("--- HERO TEXT ---");
  
  try {
    var grpHero = comp.layer("GRP_HERO");
    
    if (grpHero && grpHero.source instanceof CompItem) {
      var heroComp = grpHero.source;
      var heroTemplate = heroComp.layer("TXT_HERO_TITLE");
      var heroLines = data.hero_lines || [];
      
      if (heroLines.length > 0) {
        var startPos = heroTemplate.position.value;
        var startTime = heroTemplate.startTime;
        heroTemplate.enabled = false;

        for (var i = 0; i < heroLines.length; i++) {
          var lineData = heroLines[i];
          var textContent = "";
          var useBold = true;

          if (typeof lineData === "string") {
            textContent = lineData;
          } else if (typeof lineData === "object" && lineData !== null) {
            textContent = lineData.text || "";
            if (lineData.is_bold === false) useBold = false;
          }

          var newLayer = heroTemplate.duplicate();
          newLayer.name = "GEN_RIGA_" + (i + 1);
          newLayer.enabled = true;

          var textProp = newLayer.property("Source Text");
          try {
            var textDoc = textProp.value;
            textDoc.text = textContent;
            textDoc.font = useBold ? FONT_BOLD : FONT_REGULAR;
            textProp.setValue(textDoc);
          } catch(errFont) {
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
        }
        log("✅ Hero lines: " + heroLines.length);
      }
    }
  } catch(e) {
    log("💥 Errore hero: " + e.toString());
  }

  updateStatus(50, "rendering");

  // =====================================================
  // C. PRODOTTO
  // =====================================================
  log("--- PRODOTTO ---");
  
  try {
    var grpLabel = comp.layer("GRP_LABEL");
    
    if (grpLabel && grpLabel.source instanceof CompItem) {
      var labelComp = grpLabel.source;
      var labelText = null;
      
      try {
        labelText = labelComp.layer("TXT_LABEL_MAIN");
      } catch(e) {
        try {
          var precomp1 = labelComp.layer("Pre-comp 1");
          if (precomp1 && precomp1.source instanceof CompItem) {
            labelText = precomp1.source.layer("TXT_LABEL_MAIN");
          }
        } catch(e2) {}
      }
      
      if (labelText) {
        var prodName = data.product_name || 
                       (data.products && data.products[0] ? 
                         (data.products[0].name || data.products[0].product_name) : 
                         "PRODOTTO");
        
        var prop = labelText.property("Source Text");
        var doc = prop.value;
        doc.text = String(prodName);
        prop.setValue(doc);
        log("✅ Prodotto: " + doc.text);
      }
    }
  } catch(e) {
    log("💥 Errore prodotto: " + e.toString());
  }

  updateStatus(60, "rendering");

  // =====================================================
  // =====================================================
  // D. OUTRO
  // =====================================================
  log("--- OUTRO ---");
  var season = data.season || 'inverno';
  var seasonMap = {
    'inverno': 'WINTER',
    'autunno': 'AUTUMN',
    'primavera': 'SPRING',
    'estate': 'SUMMER'
  };
  var targetKeyword = seasonMap[season.toLowerCase()] || 'WINTER';

  try {
    var grpOutros = comp.layer("GRP_OUTROS");
    
    if (grpOutros && grpOutros.source instanceof CompItem) {
      var outroComp = grpOutros.source;
      log("Precomp GRP_OUTROS: " + outroComp.duration.toFixed(2) + "s");
      
      // Disabilita tutti
      for (var j = 1; j <= outroComp.numLayers; j++) {
        var ly = outroComp.layer(j);
        if (ly.name.indexOf("MOD_OUTRO_") !== -1) {
          ly.enabled = false;
          log("❌ " + ly.name);
        }
      }
      
      // Abilita solo quello giusto
      var outroLayer = outroComp.layer("MOD_OUTRO_" + targetKeyword);
      outroLayer.enabled = true;
      log("✅ Attivato: " + outroLayer.name);
      
      // ✅ FIX: Usa la durata del LAYER attivo, non della precomp
      var outroDuration = 6.0;  // Default
      
      if (outroLayer.source && outroLayer.source instanceof CompItem) {
        // Se il layer è una precomp, usa la sua durata
        outroDuration = outroLayer.source.duration;
        log("Durata da source: " + outroDuration.toFixed(2) + "s");
      } else {
        // Altrimenti calcola dalla lunghezza del layer
        outroDuration = outroLayer.outPoint - outroLayer.inPoint;
        log("Durata da layer timing: " + outroDuration.toFixed(2) + "s");
      }
      
      log("Durata comp: " + comp.duration.toFixed(2) + "s");
      
      // Reset timing del layer dentro la precomp
      outroLayer.startTime = 0;
      outroLayer.inPoint = 0;
      outroLayer.outPoint = outroComp.duration;
      
      // Posiziona GRP_OUTROS per far coincidere la fine
      grpOutros.enabled = true;
      
      var outroStart = comp.duration - outroDuration;
      log("Outro start calcolato: " + outroStart.toFixed(2) + "s");
      
      grpOutros.startTime = outroStart;
      
      if (outroStart < 0) {
        grpOutros.inPoint = 0;
        grpOutros.outPoint = comp.duration;
        log("⚠️ Outro più lungo, tagliato");
      } else {
        grpOutros.inPoint = outroStart;
        grpOutros.outPoint = comp.duration;
      }
      
      log("✅ OUTRO POSIZIONATO:");
      log("  Layer: " + targetKeyword);
      log("  startTime: " + grpOutros.startTime.toFixed(2) + "s");
      log("  inPoint: " + grpOutros.inPoint.toFixed(2) + "s");
      log("  outPoint: " + grpOutros.outPoint.toFixed(2) + "s");
      log("  Durata effettiva: " + outroDuration.toFixed(2) + "s");
    }
  } catch(e) {
    log("💥 Errore outro: " + e.toString());
  }

  // =====================================================
  // E. RENDER
  // =====================================================
  log("--- RENDER ---");
  
  while (app.project.renderQueue.numItems > 0) {
    app.project.renderQueue.item(1).remove();
  }

  var rqItem = app.project.renderQueue.items.add(comp);
  var outputModule = rqItem.outputModule(1);
  var outputPath = data.output_path || (baseFolder + "/_temp_data/renders/output_" + data.job_id + ".mp4");
  
  var outFile = new File(outputPath);
  if (outFile.exists) outFile.remove();
  outputModule.file = outFile;

  log("🎬 Render...");
  updateStatus(75, "rendering");
  
  app.project.renderQueue.render();
  
  log("✅ COMPLETATO");
  updateStatus(100, "completed");

  var finalVideoName = "output_" + data.job_id + ".mp4";
  var finalStatus = new File(statusPath);
  finalStatus.open("w");
  var finalObj = {
    status: "completed",
    progress: 100,
    output_path: "/api/output/" + finalVideoName,
    completed_at: new Date().getTime()
  };
  finalStatus.write(toJSON(finalObj));
  finalStatus.close();

  app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES);
  log("=== FINE ===");
  
  $.sleep(1000);
  app.quit();

} catch (e) {
  var errorMsg = e.toString() + (e.line ? " (Linea: " + e.line + ")" : "");
  alert("CRASH: " + errorMsg);
  log("💥 CRASH: " + errorMsg);
  updateStatus(0, "failed", errorMsg);
}

})();
