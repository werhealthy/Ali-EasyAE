// render_alifind.jsx - VERSIONE FINALE CON HERO TEXT + REMOVE BG

(function () {

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
      var v = obj[key];
      var jsonValue;
      if (typeof v === "string") jsonValue = '"' + v.replace(/"/g, '\\"') + '"';
      else if (typeof v === "number" || typeof v === "boolean") jsonValue = String(v);
      else if (v === null) jsonValue = "null";
      else jsonValue = '""';
      parts.push('"' + key + '":' + jsonValue);
    }
  }
  return '{' + parts.join(',') + '}';
}

function updateStatus(progress, status, error) {
  if (!statusPath) return;
  try {
    var statusFile = new File(statusPath);
    var o = { status: status || "rendering", progress: progress || 0, started_at: new Date().getTime() };
    if (error) o.error = error;
    statusFile.open("w");
    statusFile.write(toJSON(o));
    statusFile.close();
  } catch(e) {}
}

function readFileText(file) {
  file.open("r");
  var txt = file.read();
  file.close();
  return txt;
}

function parseJsonCompat(txt) {
  try { return eval("(" + txt + ")"); } catch(e) { throw e; }
}

function parseJSONFile(path) {
  var f = new File(path);
  if (!f.exists) throw new Error("Job JSON non trovato: " + path);
  return parseJsonCompat(readFileText(f));
}

function importFootage(fileObj) {
  if (!fileObj.exists) throw new Error("File non trovato: " + fileObj.fsName);
  var io = new ImportOptions(fileObj);
  return app.project.importFile(io);
}

function findCompByName(name) {
  for (var i = 1; i <= app.project.numItems; i++) {
    var it = app.project.item(i);
    if (it && it instanceof CompItem && it.name === name) return it;
  }
  throw new Error("Comp non trovata: " + name);
}

function findLayerByName(comp, layerName) {
  for (var i = 1; i <= comp.numLayers; i++) {
    var l = comp.layer(i);
    if (l && l.name === layerName) return l;
  }
  throw new Error("Layer non trovato in " + comp.name + ": " + layerName);
}

function setTextLayerValue(textLayer, newText) {
  var doc = textLayer.property("Source Text").value;
  doc.text = newText;
  textLayer.property("Source Text").setValue(doc);
}

// ---- MAIN ----
try {
  baseFolder = computeBaseFolder();
  if (!baseFolder) {
    alert("ERRORE: impossibile determinare baseFolder");
    return;
  }

  var jobPath = baseFolder + "/_temp_data/job_data.json";
  var job = parseJSONFile(jobPath);
  if (!job.job_id) job.job_id = "alifind_" + new Date().getTime();
  statusPath = baseFolder + "/_temp_data/status_" + job.job_id + ".json";
  updateStatus(10, "rendering");
  log("AliFind: job_id=" + job.job_id);

  if (!job.template_aep_path) throw new Error("job.template_aep_path mancante");
  if (!job.input_video_path) throw new Error("job.input_video_path mancante");
  if (!job.products || job.products.length < 1) throw new Error("job.products deve avere almeno 1 prodotto");

  if (app.project) {
    try { app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES); } catch(e) {}
  }

  var aepFile = new File(job.template_aep_path);
  if (!aepFile.exists) throw new Error("Template AEP non trovato: " + job.template_aep_path);
  app.open(aepFile);
  updateStatus(20, "rendering");

  var comp = findCompByName("MAIN_COMP");

  // Replace input video
  var inputLayer = findLayerByName(comp, "input.mp4");
  var f = new File(job.input_video_path);
  if (!f.exists) throw new Error("Input video non esiste: " + job.input_video_path);
  var footage = importFootage(f);
  inputLayer.replaceSource(footage, false);

  var D = footage.duration;
  var targetD = D;

  if (D < 0.2) throw new Error("Video troppo corto per essere gestito.");

  if (D < 6.0) {
    targetD = 10.0;
    var stretchPct = (targetD / D) * 100.0;
    inputLayer.stretch = stretchPct;
    inputLayer.startTime = 0;
    inputLayer.inPoint = 0;
    inputLayer.outPoint = targetD;
    log("Time-stretch applicato: " + D + "s -> " + targetD + "s");
  }

  comp.duration = targetD;

  // OUTRO ultimi 6s
  var outro = findLayerByName(comp, "OUTRO_CLIP");
  var outroDur = 6.0;
  var outroStart = targetD - outroDur;
  if (outroStart < 0.5) throw new Error("Durata comp troppo corta per inserire outro 6s.");
  outro.startTime = outroStart;
  outro.inPoint = outroStart;
  outro.outPoint = targetD;

  // Timing prodotti
  var available = outroStart;
  var N = job.products.length;
  var introExtra = Math.min(1.0, available * 0.25);
  var slot = (available - introExtra) / N;
  if (slot < 0.2) slot = 0.2;

  var baseBlock = findLayerByName(comp, "PRODUCT_BLOCK");
  if (!(baseBlock.source && baseBlock.source instanceof CompItem)) {
    throw new Error("PRODUCT_BLOCK deve essere un precomp layer (source CompItem).");
  }

  var basePos = baseBlock.property("Position").value;
  var dx = 80;
  var dy = -40;
  baseBlock.enabled = false;

  function applyProductToBlock(blockComp, p) {
    var imgLayer = findLayerByName(blockComp, "PRODUCT_IMAGE");
    var imgFile = new File(p.image_path);
    if (!imgFile.exists) throw new Error("Immagine prodotto non trovata: " + p.image_path);
    var imgFootage = importFootage(imgFile);
    imgLayer.replaceSource(imgFootage, false);

    var maxWidth = 400;
    var maxHeight = 400;

    try {
      var srcRect = imgLayer.sourceRectAtTime(0, false);
      var imgW = srcRect.width;
      var imgH = srcRect.height;

      if (imgW > 0 && imgH > 0) {
        var scaleX = (maxWidth / imgW) * 100;
        var scaleY = (maxHeight / imgH) * 100;
        var finalScale = Math.min(scaleX, scaleY);
        imgLayer.property("Scale").setValue([finalScale, finalScale]);
        log("Immagine " + p.name + " scalata a " + finalScale.toFixed(1) + "%");
      }
    } catch(e) {
      log("Warning: auto-fit fallito per " + p.name + ": " + e.toString());
    }

    var labelLayer = findLayerByName(blockComp, "LABEL_BOX");
    if (!(labelLayer.source && labelLayer.source instanceof CompItem)) {
      throw new Error("LABEL_BOX deve essere un precomp dentro PRODUCT_BLOCK.");
    }

    var labelCompOriginal = labelLayer.source;
    var labelCompDuplicated = labelCompOriginal.duplicate();
    labelCompDuplicated.name = "LABEL_BOX_" + p.name;
    labelLayer.replaceSource(labelCompDuplicated, false);

    var nameText = findLayerByName(labelCompDuplicated, "PRODUCT_NAME_TEXT");
    setTextLayerValue(nameText, p.name);
    log("Nome prodotto impostato: " + p.name);
  }

  var t = 0;
  for (var i = 0; i < N; i++) {
    var p = job.products[i];
    var dur = slot;
    if (i === 0) dur = slot + introExtra;
    var start = t;
    var end = start + dur;
    t = end;

    var clone = baseBlock.duplicate();
    clone.enabled = true;
    clone.name = "PRODUCT_BLOCK_" + (i + 1);

    var newComp = baseBlock.source.duplicate();
    newComp.name = "PRODUCT_BLOCK_COMP_" + (i + 1);
    clone.replaceSource(newComp, false);

    clone.property("Position").setValue([basePos[0] + i * dx, basePos[1] + i * dy]);
    clone.startTime = 0;
    clone.inPoint = start;
    clone.outPoint = end;

    applyProductToBlock(newComp, p);
  }

  updateStatus(70, "rendering");

  // --- HERO TEXT ---
  if (job.hero_lines && job.hero_lines.length > 0) {
    log("Inizio generazione " + job.hero_lines.length + " hero lines");
    
    try {
      var heroTextLayer = findLayerByName(comp, "HERO_TEXT");
      if (!(heroTextLayer.source && heroTextLayer.source instanceof CompItem)) {
        throw new Error("HERO_TEXT non è una precomp");
      }
      
      var heroTextComp = heroTextLayer.source;
      
      // ✅ NOME CORRETTO: "HERO_LINE" (senza quadre!)
      var heroLineLayer = findLayerByName(heroTextComp, "HERO_LINE");
      
      if (!(heroLineLayer.source && heroLineLayer.source instanceof CompItem)) {
        throw new Error("HERO_LINE non è una precomp");
      }
      
      var heroLineBaseComp = heroLineLayer.source;
      var heroBasePos = heroLineLayer.position.value;
      var heroBaseTime = heroLineLayer.startTime;
      var SPAZIATURA_Y = 120; // ✅ PIÙ SPAZIATURA per evitare tagli
      var DELAY_TEMPO = 0.2;
      
      heroLineLayer.enabled = false;
      log("Template HERO_LINE disabilitato");
      
      for (var h = 0; h < job.hero_lines.length; h++) {
        var heroText = (typeof job.hero_lines[h] === "string") ? job.hero_lines[h] : (job.hero_lines[h].text || "");
        
        log("Hero line " + (h+1) + ": " + heroText);
        
        var newHeroLayer = heroLineLayer.duplicate();
        newHeroLayer.name = "HERO_GEN_" + (h + 1);
        newHeroLayer.enabled = true;
        
        // ✅ PORTA IN PRIMO PIANO
        newHeroLayer.moveToBeginning();
        
        var newHeroComp = heroLineBaseComp.duplicate();
        newHeroComp.name = "HERO_LINE_COMP_" + (h + 1);
        newHeroLayer.replaceSource(newHeroComp, false);
        
        var textLayer = findLayerByName(newHeroComp, "HERO_LINE_TEXT");
        var textProp = textLayer.property("Source Text");
        var textDoc = textProp.value;
        textDoc.text = heroText;
        textProp.setValue(textDoc);
        
        log("Testo impostato: " + heroText);
        
        newHeroLayer.position.setValue([heroBasePos[0], heroBasePos[1] + (h * SPAZIATURA_Y)]);
        newHeroLayer.startTime = heroBaseTime + (h * DELAY_TEMPO);
        
        if (newHeroLayer.trackMatteType != TrackMatteType.NO_TRACK_MATTE) {
          newHeroLayer.trackMatteType = TrackMatteType.NO_TRACK_MATTE;
        }
        
        var masks = newHeroLayer.property("Masks");
        if (masks && masks.numProperties > 0) {
          for (var m = masks.numProperties; m >= 1; m--) {
            masks.property(m).remove();
          }
        }
      }
      
      log("Tutte le hero lines create: " + job.hero_lines.length);
      
    } catch(heroError) {
      log("WARNING Hero Text: " + heroError.toString());
    }
  } else {
    log("Nessuna hero_line nel job, skip");
  }

  // --- RENDER QUEUE ---
  while (app.project.renderQueue.numItems > 0) {
    app.project.renderQueue.item(1).remove();
  }

  var rqItem = app.project.renderQueue.items.add(comp);
  var outputModule = rqItem.outputModule(1);
  var outputPath = job.output_path || (baseFolder + "/_output/output_" + job.job_id + ".mp4");
  outputModule.file = new File(outputPath);
  log("Render avviato: " + outputPath);
  updateStatus(80, "rendering");
  app.project.renderQueue.render();
  updateStatus(100, "completed");
  log("Render completato!");

  var finalStatus = new File(statusPath);
  finalStatus.open("w");
  var finalVideoName = "output_" + job.job_id + ".mp4";
  var finalObj = {
    status: "completed",
    progress: 100,
    output_path: "/api/output/" + finalVideoName,
    completed_at: new Date().getTime()
  };
  finalStatus.write(toJSON(finalObj));
  finalStatus.close();

  app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES);
  app.quit();

} catch (e) {
  var msg = e.toString() + (e.line ? (" (Linea: " + e.line + ")") : "");
  alert("ERRORE SCRIPT:\n" + msg);
  try { log("CRASH: " + msg); } catch(_) {}
  try { updateStatus(0, "failed", msg); } catch(_) {}
}

})();
