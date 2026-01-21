// render_alireal.jsx - VERSIONE FINALE

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
    f.writeln("[" + new Date().toTimeString().substring(0,8) + "] " + msg);
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
    log("Status: " + progress + "% - " + status);
  } catch(e) {
    log("Errore status: " + e.toString());
  }
}

try {
  baseFolder = computeBaseFolder();
  if (!baseFolder) {
    alert("ERRORE: impossibile determinare baseFolder");
    return;
  }

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
    log('Usando job_data: ' + jsonPath);
  } else {
    jsonPath = baseFolder + '/_temp_data/job_data.json';
    log('Fallback a job_data.json');
  }

  var FONT_BOLD = "AliExpresssans-Blod";
  var FONT_REGULAR = "AliExpresssans-Regular";
  var SPAZIATURA_Y = 90;
  var DELAY_TEMPO = 0.2;
  var NOME_LIV_HERO = "TEXT_TEMPLATE";
  var NOME_LIV_PROD = "TEXT_FOOTER";

  var jsonFile = new File(jsonPath);
  if (!jsonFile.exists) {
    alert("ERRORE: JSON non trovato in " + jsonPath);
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

  statusPath = baseFolder + "/_temp_data/status_" + data.job_id + ".json";
  log("AliReal job_id: " + data.job_id);
  updateStatus(15, "rendering");

  var templatePath = data.template_aep_path;
  if (templatePath && templatePath.indexOf('/') !== 0) {
    templatePath = baseFolder + '/' + templatePath;
  }
  log("Template path: " + templatePath);

  var tplFile = new File(templatePath);
  if (!tplFile.exists) {
    alert("ERRORE: Template AEP non trovato: " + templatePath);
    updateStatus(0, "failed", "Template AEP non trovato");
    return;
  }

  if (app.project && app.project.file && app.project.file.toString() !== templatePath.toString()) {
    app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES);
  }

  app.open(tplFile);
  var comp = app.project.activeItem || app.project.item(1);
  updateStatus(25, "rendering");

  // SOSTITUZIONE VIDEO
  var videoPath = data.input_video_path || data.video_path;
  if (videoPath) {
    log("Inizio sostituzione video: " + videoPath);
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
        var newVideoFile = new File(videoPath);
        if (newVideoFile.exists) {
          log("File video trovato: " + videoPath);
          var importedVideo = app.project.importFile(new ImportOptions(newVideoFile));
          videoLayer.replaceSource(importedVideo, false);
          
          // AUTO-ZOOM
          var compWidth = comp.width;
          var compHeight = comp.height;
          var videoWidth = importedVideo.width;
          var videoHeight = importedVideo.height;
          var compRatio = compWidth / compHeight;
          var videoRatio = videoWidth / videoHeight;
          var scaleToFill = 100;
          
          if (videoRatio < compRatio) {
            scaleToFill = (compWidth / videoWidth) * 100;
          } else {
            scaleToFill = (compHeight / videoHeight) * 100;
          }
          
          videoLayer.property("Scale").setValue([scaleToFill, scaleToFill]);
          log("Video scalato a " + scaleToFill.toFixed(1) + "%");
          
          // Aggiorna durata comp
          var D = importedVideo.duration;
          comp.duration = D;
          videoLayer.startTime = 0;
          videoLayer.inPoint = 0;
          videoLayer.outPoint = D;
          log("Durata comp: " + D.toFixed(2) + "s");
          
          updateStatus(40, "rendering");
        } else {
          log("ERRORE: File video non trovato: " + videoPath);
        }
      } catch(errVideo) {
        log("ERRORE sostituzione video: " + errVideo.toString());
      }
    } else {
      log("ATTENZIONE: Nessun layer video trovato");
    }
  } else {
    log("Nessun video nel JSON");
  }

  // OUTRO STAGIONALE
  var season = data.season || 'inverno';
  log("Stagione: " + season);
  log("Durata comp corrente: " + comp.duration.toFixed(2) + "s");

  var allSeasons = ['INVERNO', 'AUTUNNO', 'PRIMAVERA', 'ESTATE'];
  for (var s = 0; s < allSeasons.length; s++) {
    try {
      var tempOutro = comp.layer('OUTRO_' + allSeasons[s]);
      if (tempOutro) {
        tempOutro.enabled = false;
        log("Disabilitato: OUTRO_" + allSeasons[s]);
      }
    } catch(e) {
      log("OUTRO_" + allSeasons[s] + " non trovato (ok)");
    }
  }

  var outro = null;
  var outroLayerName = 'OUTRO_' + season.toUpperCase();
  log("Cerco layer: " + outroLayerName);

  try {
    outro = comp.layer(outroLayerName);
    if (outro) {
      outro.enabled = true;
      log("Attivato: " + outroLayerName);
    } else {
      log("Layer null: " + outroLayerName);
    }
  } catch(e) {
    log("ERRORE: " + outroLayerName + " - " + e.toString());
  }

  if (outro) {
    var compDuration = comp.duration;
    var outroDuration = outro.source ? outro.source.duration : 6.0;
    var outroStart = compDuration - outroDuration;
    if (outroStart < 0) outroStart = 0;
    
    outro.startTime = outroStart;
    outro.inPoint = outroStart;
    outro.outPoint = compDuration;
    log("OUTRO posizionato: start=" + outroStart.toFixed(2) + "s");
  } else {
    log("OUTRO non posizionato (layer null)");
  }

  // PRODOTTO
  updateStatus(45, "rendering");
  var layerProdotto = comp.layer(NOME_LIV_PROD);
  if (layerProdotto) {
    var prop = layerProdotto.property("Source Text");
    var doc = prop.value;
    doc.text = data.product_name ? String(data.product_name) : "NOME PRODOTTO";
    prop.setValue(doc);
    log("Prodotto: " + doc.text);
  }

  // HERO TEXT
  updateStatus(50, "rendering");
  var heroLayer = comp.layer(NOME_LIV_HERO);
  if (!heroLayer) {
    alert("ERRORE: TEXT_TEMPLATE non trovato!");
    updateStatus(0, "failed", "TEXT_TEMPLATE non trovato");
    return;
  }

  if (!data.hero_lines || data.hero_lines.length === 0) {
    alert("ERRORE: Nessuna hero_line!");
    updateStatus(0, "failed", "Nessuna hero_line");
    return;
  }

  log("Generazione " + data.hero_lines.length + " hero lines");
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

    log("Hero " + (i+1) + ": " + textContent);

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
      log("Font fallito");
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

  log("Hero lines completate");
  updateStatus(70, "rendering");

  // RENDER
  while (app.project.renderQueue.numItems > 0) {
    app.project.renderQueue.item(1).remove();
  }

  var rqItem = app.project.renderQueue.items.add(comp);
  var outputModule = rqItem.outputModule(1);
  var outputPath = data.output_path || (baseFolder + "/_temp_data/renders/output_" + data.job_id + ".mp4");
  outputModule.file = new File(outputPath);

  log("Render avviato: " + outputPath);
  updateStatus(75, "rendering");

  app.project.renderQueue.render();

  log("Render completato!");

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
  log("Status finale scritto");

  app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES);
  log("Progetto chiuso");

  $.sleep(2000);
  log("Quit in 2s");
  app.quit();

} catch (e) {
  var errorMsg = e.toString() + " (Linea: " + e.line + ")";
  alert("CRASH: " + errorMsg);
  log("CRASH: " + errorMsg);
  updateStatus(0, "failed", errorMsg);
}

})();
