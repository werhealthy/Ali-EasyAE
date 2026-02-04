// render_alifind_smart_animator.jsx
// LOGICA VECCHIA + NOMENCLATURA NUOVA + DEBUG OUTRO + FIX KEYFRAME SCALE


(function() {
  var statusPath;
  var baseFolder;


  // ===== UTILITY FUNCTIONS =====


  function computeBaseFolder() {
    try {
      var scriptFile = new File($.fileName);
      return scriptFile.parent.parent.fsName;
    } catch(e) {
      return '';
    }
  }


  function log(msg) {
    try {
      var logPath = baseFolder + '/_temp_data/production_log.txt';
      var f = new File(logPath);
      f.open('a');
      f.writeln(new Date().toTimeString().substring(0,8) + ' ' + msg);
      f.close();
    } catch(e) {}
  }


  function toJSON(obj) {
    var parts = [];
    for (var key in obj) {
      if (obj.hasOwnProperty(key)) {
        var v = obj[key];
        var jsonValue;
        if (typeof v === 'string') {
          jsonValue = '"' + v.replace(/"/g, '\\"') + '"';
        } else if (typeof v === 'number' || typeof v === 'boolean') {
          jsonValue = String(v);
        } else if (v === null) {
          jsonValue = 'null';
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
      var timestamp = new Date().getTime();
      var o = {
        status: status || 'rendering',
        progress: progress || 0,
        started_at: timestamp
      };
      if (error) o.error = error;
      statusFile.open('w');
      statusFile.write(toJSON(o));
      statusFile.close();
    } catch(e) {}
  }


  function readFileText(file) {
    file.open('r');
    var txt = file.read();
    file.close();
    return txt;
  }


  function parseJsonCompat(txt) {
    try {
      return eval('(' + txt + ')');
    } catch(e) {
      throw e;
    }
  }


  function parseJSONFile(path) {
    var f = new File(path);
    if (!f.exists) throw new Error('Job JSON non trovato: ' + path);
    return parseJsonCompat(readFileText(f));
  }


  function importFootage(fileObj) {
    if (!fileObj.exists) throw new Error('File non trovato: ' + fileObj.fsName);
    var io = new ImportOptions(fileObj);
    return app.project.importFile(io);
  }


  function findCompByName(name) {
    for (var i = 1; i <= app.project.numItems; i++) {
      var it = app.project.item(i);
      if (it && it instanceof CompItem && it.name === name) {
        return it;
      }
    }
    throw new Error('Comp non trovata: ' + name);
  }


  function findLayerByName(comp, layerName) {
    for (var i = 1; i <= comp.numLayers; i++) {
      var l = comp.layer(i);
      if (l && l.name === layerName) return l;
    }
    throw new Error('Layer non trovato in ' + comp.name + ': ' + layerName);
  }


  function setTextLayerValue(textLayer, newText) {
    var doc = textLayer.property('Source Text').value;
    doc.text = newText;
    textLayer.property('Source Text').setValue(doc);
  }


  /// ===== MAIN =====


  try {
    baseFolder = computeBaseFolder();
    if (!baseFolder) {
      alert('ERRORE: impossibile determinare baseFolder');
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
      log('📄 Usando job_data: ' + jsonPath);
    } else {
      jsonPath = baseFolder + '/_temp_data/job_data.json';
    }


    var job = parseJSONFile(jsonPath);
    if (!job.job_id) job.job_id = 'alifind_' + new Date().getTime();


    statusPath = baseFolder + '/_temp_data/status_' + job.job_id + '.json';
    updateStatus(10, 'rendering');
    log('AliFind job_id: ' + job.job_id);


    var season = job.season || 'inverno';
    log('🌍 Stagione input: ' + season);


    if (app.project) {
      try {
        app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES);
      } catch(e) {}
    }


    var aepFile = new File(job.template_aep_path);
    if (!aepFile.exists) throw new Error('Template AEP non trovato: ' + job.template_aep_path);
    
    app.open(aepFile);
    updateStatus(20, 'rendering');


    var comp = findCompByName('MASTER_RENDER');
    log('✅ Comp: ' + comp.name + ', layers: ' + comp.numLayers);


    // =====================================================
    // 1. VIDEO INPUT - MULTI-VIDEO SUPPORT
    // =====================================================
    log('=== VIDEO INPUT ===');
    
    var inputLayer = findLayerByName(comp, 'GRP_INPUT_VIDEO');
    
    // ✅ Controlla se ci sono più video (array) o singolo
    var videoPaths = [];
    if (job.input_video_paths && job.input_video_paths.length > 0) {
      videoPaths = job.input_video_paths;
      log('📹 Multi-video: ' + videoPaths.length + ' clip');
    } else if (job.input_video_path) {
      videoPaths = [job.input_video_path];
      log('📹 Singolo video');
    } else {
      throw new Error('Nessun video path nel JSON');
    }
    
    // Verifica tutti i file esistano
    var footages = [];
    var totalDuration = 0;
    
    for (var v = 0; v < videoPaths.length; v++) {
      var videoFile = new File(videoPaths[v]);
      if (!videoFile.exists) {
        throw new Error('Video non trovato: ' + videoPaths[v]);
      }
      var footage = importFootage(videoFile);
      footages.push(footage);
      totalDuration += footage.duration;
      log('  [' + (v+1) + '] ' + footage.duration.toFixed(2) + 's');
    }
    
    log('Durata totale: ' + totalDuration.toFixed(2) + 's');
    
    // ✅ Logica stretch intelligente
    var MIN_DURATION = 10.0;
    var targetDuration;
    var needsStretch = false;
    
    if (totalDuration < MIN_DURATION) {
      targetDuration = MIN_DURATION;
      needsStretch = true;
      log('⚠️ Video troppo corti, stretch a ' + MIN_DURATION + 's');
    } else {
      targetDuration = totalDuration;
      log('✅ Durata OK, nessuno stretch');
    }
    
    // Calcola stretch percentage
    var stretchPct = needsStretch ? (targetDuration / totalDuration) * 100.0 : 100.0;
    log('Stretch: ' + stretchPct.toFixed(1) + '%');
    
    // ✅ CASO 1: Singolo video
    if (footages.length === 1) {
      inputLayer.replaceSource(footages[0], false);
      inputLayer.stretch = stretchPct;
      inputLayer.startTime = 0;
      inputLayer.inPoint = 0;
      inputLayer.outPoint = targetDuration;
      log('✅ Video singolo applicato');
    } 
    // ✅ CASO 2: Multi-video (crea precomp con sequenza)
    else {
      log('Creo precomp con ' + footages.length + ' video...');
      
      // Crea una nuova comp per concatenare i video
      var videoSeqComp = app.project.items.addComp(
        'VIDEO_SEQUENCE_' + job.job_id,
        comp.width,
        comp.height,
        comp.pixelAspect,
        targetDuration,
        comp.frameRate
      );
      
      var currentTime = 0;
      for (var v = 0; v < footages.length; v++) {
        var vLayer = videoSeqComp.layers.add(footages[v]);
        var clipDuration = footages[v].duration * (stretchPct / 100.0);
        
        vLayer.stretch = stretchPct;
        vLayer.startTime = currentTime;
        vLayer.inPoint = currentTime;
        vLayer.outPoint = currentTime + clipDuration;
        
        // Auto-fit cover
        try {
          var srcRect = vLayer.sourceRectAtTime(0, false);
          var compRatio = comp.width / comp.height;
          var videoRatio = srcRect.width / srcRect.height;
          var scaleToFill = (videoRatio < compRatio) ? 
            (comp.width / srcRect.width) * 100 : 
            (comp.height / srcRect.height) * 100;
          vLayer.property('Scale').setValue([scaleToFill, scaleToFill]);
          vLayer.property('Position').setValue([comp.width/2, comp.height/2]);
        } catch(e) {}
        
        log('  [' + (v+1) + '] @ ' + currentTime.toFixed(2) + 's → ' + (currentTime + clipDuration).toFixed(2) + 's');
        currentTime += clipDuration;
      }
      
      // Sostituisci GRP_INPUT_VIDEO con la precomp
      inputLayer.replaceSource(videoSeqComp, false);
      inputLayer.stretch = 100.0; // Già stretchato dentro
      inputLayer.startTime = 0;
      inputLayer.inPoint = 0;
      inputLayer.outPoint = targetDuration;
      log('✅ Sequenza video applicata');
    }
    
    comp.duration = targetDuration;
    log('✅ Comp duration: ' + targetDuration.toFixed(2) + 's');
    updateStatus(30, 'rendering');


    // =====================================================
    // 2. OUTRO
    // =====================================================
    log('=== OUTRO ===');
    
    var seasonMap = {
      'inverno': 'WINTER',
      'autunno': 'AUTUMN',
      'primavera': 'SPRING',
      'estate': 'SUMMER'
    };
    var targetKeyword = seasonMap[season.toLowerCase()] || 'WINTER';
    log('Target: MOD_OUTRO_' + targetKeyword);
    
    var grpOutros = findLayerByName(comp, 'GRP_OUTROS');
    if (!grpOutros.source || !(grpOutros.source instanceof CompItem)) {
      throw new Error('GRP_OUTROS non è precomp');
    }
    
    var outroComp = grpOutros.source;
    
    // Disabilita tutti
    var allSeasons = ['WINTER', 'AUTUMN', 'SPRING', 'SUMMER'];
    for (var s = 0; s < allSeasons.length; s++) {
      try {
        var tempOutro = outroComp.layer('MOD_OUTRO_' + allSeasons[s]);
        if (tempOutro) tempOutro.enabled = false;
      } catch(e) {}
    }
    
    // Abilita e resetta quello giusto
    var outroLayer = outroComp.layer('MOD_OUTRO_' + targetKeyword);
    outroLayer.enabled = true;
    outroLayer.startTime = 0;
    outroLayer.inPoint = 0;
    outroLayer.outPoint = outroComp.duration;
    
    // Posiziona GRP_OUTROS alla fine
    grpOutros.enabled = true;
    var outroDuration = outroLayer.source ? outroLayer.source.duration : 6.0;
    var outroStart = targetDuration - outroDuration;
    if (outroStart < 0) outroStart = 0;
    
    grpOutros.startTime = outroStart;
    grpOutros.inPoint = outroStart;
    grpOutros.outPoint = targetDuration;
    log('✅ OUTRO @ ' + outroStart.toFixed(2) + 's');
    
    // =====================================================
    // 3. PRODOTTI - FIX KEYFRAME ANIMATI
    // =====================================================
    updateStatus(45, 'rendering');
    log('=== PRODOTTI ===');
    
    var N = job.products.length;
    var PRODUCT_DURATION = 3.0;
    log('Prodotti: ' + N);
    
    var baseBlock = findLayerByName(comp, 'GRP_LABEL');
    if (!baseBlock.source || !(baseBlock.source instanceof CompItem)) {
      throw new Error('GRP_LABEL deve essere precomp');
    }
    
    var basePos = baseBlock.property('Position').value;
    var dx = 80;
    var dy = -40;
    baseBlock.enabled = false;
    log('Template disabilitato');
    
    function applyProductToBlock(blockComp, p) {
      var imgLayer = findLayerByName(blockComp, 'SRC_PRODUCT_IMG_1');
      var imgFile = new File(p.image_path);
      if (!imgFile.exists) throw new Error('Immagine non trovata: ' + p.image_path);
      
      var imgFootage = importFootage(imgFile);
      imgLayer.replaceSource(imgFootage, false);
      
      // ✅ RIMUOVI KEYFRAME ANIMATI SULLA SCALA
      var scaleProp = imgLayer.property('Scale');
      var numKeysRemoved = scaleProp.numKeys;
      while (scaleProp.numKeys > 0) {
        scaleProp.removeKey(1);
      }
      if (numKeysRemoved > 0) {
        log('  🔧 Rimossi ' + numKeysRemoved + ' keyframe da Scale');
      }

      // ✅ USA IL VALORE SCALE DALL'UTENTE
      var userScale = p.scale || 1.0;  // Default 1.0 se non presente
      var maxWidth = 1200 * userScale;   // Regolato dall'utente
      var maxHeight = 1200 * userScale;

      log('  🎚️ Scala utente: ' + userScale.toFixed(1) + 'x (target: ' + maxWidth.toFixed(0) + 'px)');

            
      try {
        var srcRect = imgLayer.sourceRectAtTime(0, false);
        var imgW = srcRect.width;
        var imgH = srcRect.height;
        
        if (imgW > 0 && imgH > 0) {
          var scaleX = (maxWidth / imgW) * 100;
          var scaleY = (maxHeight / imgH) * 100;
          var finalScale = Math.min(scaleX, scaleY);
          
          // Margine di sicurezza del 20%
          finalScale = finalScale;
          
          scaleProp.setValue([finalScale, finalScale]);
          log('  Immagine: ' + imgW + 'x' + imgH + ' → scale ' + finalScale.toFixed(1) + '%');
        }
      } catch(e) {
        log('⚠️ Errore fit immagine: ' + e.toString());
      }
      
      var labelLayer = findLayerByName(blockComp, 'LABEL_BOX');
      if (!labelLayer.source || !(labelLayer.source instanceof CompItem)) {
        throw new Error('LABEL_BOX deve essere precomp');
      }
      
      var labelCompOriginal = labelLayer.source;
      var labelCompDuplicated = labelCompOriginal.duplicate();
      labelCompDuplicated.name = 'LABEL_BOX_' + p.name;
      labelLayer.replaceSource(labelCompDuplicated, false);
      
      var nameText = findLayerByName(labelCompDuplicated, 'PRODUCT_NAME_TEXT');
      setTextLayerValue(nameText, p.name);
    }
    
    for (var i = 0; i < N; i++) {
      var p = job.products[i];
      var start = i * PRODUCT_DURATION;
      log('  [' + (i+1) + '] ' + p.name + ' @ ' + start.toFixed(2) + 's');
      
      var clone = baseBlock.duplicate();
      clone.enabled = true;
      clone.name = 'GRP_LABEL_' + (i + 1);
      
      var newComp = baseBlock.source.duplicate();
      newComp.name = 'GRP_LABEL_COMP_' + (i + 1);
      newComp.duration = PRODUCT_DURATION;
      clone.replaceSource(newComp, false);
      
      clone.property('Position').setValue([basePos[0] + i * dx, basePos[1] + i * dy]);
      clone.startTime = start;
      
      applyProductToBlock(newComp, p);
    }
    log('=== FINE PRODOTTI ===');
    
    // 4. HERO TEXT
    updateStatus(70, 'rendering');
    log('=== INIZIO HERO ===');
    
    if (job.hero_lines && job.hero_lines.length > 0) {
      log('Hero lines: ' + job.hero_lines.length);
      
      var grpHero = findLayerByName(comp, 'GRP_HERO');
      if (!grpHero.source || !(grpHero.source instanceof CompItem)) {
        throw new Error('GRP_HERO non è precomp');
      }
      
      var heroComp = grpHero.source;
      var heroLineLayer = findLayerByName(heroComp, 'TXT_HERO_TITLE');
      if (!heroLineLayer.source || !(heroLineLayer.source instanceof CompItem)) {
        throw new Error('TXT_HERO_TITLE non è precomp');
      }
      
      var heroLineBaseComp = heroLineLayer.source;
      var heroBasePos = heroLineLayer.property('Position').value;
      var heroBaseTime = heroLineLayer.startTime;
      var SPAZIATURA_Y = 120;
      var DELAY_TEMPO = 0.2;
      
      heroLineLayer.enabled = false;
      log('Template TXT_HERO_TITLE disabilitato');
      
      for (var h = 0; h < job.hero_lines.length; h++) {
        var heroText = (typeof job.hero_lines[h] === 'string') ? job.hero_lines[h] : job.hero_lines[h].text;
        log('  [' + (h+1) + '] "' + heroText + '"');
        
        var newHeroLayer = heroLineLayer.duplicate();
        newHeroLayer.name = 'HERO_LINE_' + (h + 1);
        newHeroLayer.enabled = true;
        newHeroLayer.moveToBeginning();
        
        var newHeroComp = heroLineBaseComp.duplicate();
        newHeroComp.name = 'TXT_HERO_TITLE_COMP_' + (h + 1);
        newHeroLayer.replaceSource(newHeroComp, false);
        
        var textLayer = findLayerByName(newHeroComp, 'HERO_LINE_TEXT');
        setTextLayerValue(textLayer, heroText);
        
        newHeroLayer.property('Position').setValue([heroBasePos[0], heroBasePos[1] + h * SPAZIATURA_Y]);
        newHeroLayer.startTime = heroBaseTime + h * DELAY_TEMPO;
        
        if (newHeroLayer.trackMatteType !== TrackMatteType.NO_TRACK_MATTE) {
          newHeroLayer.trackMatteType = TrackMatteType.NO_TRACK_MATTE;
        }
        var masks = newHeroLayer.property('Masks');
        if (masks && masks.numProperties > 0) {
          for (var m = masks.numProperties; m >= 1; m--) {
            masks.property(m).remove();
          }
        }
      }
    }
    log('=== FINE HERO ===');
    
    // 5. RENDER
    updateStatus(80, 'rendering');
    log('=== RENDER ===');
    
    while (app.project.renderQueue.numItems > 0) {
      app.project.renderQueue.item(1).remove();
    }
    
    var rqItem = app.project.renderQueue.items.add(comp);
    var outputModule = rqItem.outputModule(1);
    var outputPath = job.output_path || (baseFolder + '/_temp_data/renders/output_' + job.job_id + '.mp4');
    var outputFile = new File(outputPath);
    if (outputFile.exists) outputFile.remove();
    outputModule.file = outputFile;
    
    log('🎬 Output: ' + outputPath);
    app.project.renderQueue.render();
    
    log('✅ RENDER COMPLETATO');
    
    var finalStatus = new File(statusPath);
    finalStatus.open('w');
    var finalVideoName = 'output_' + job.job_id + '.mp4';
    var timestamp = new Date().getTime();
    var finalObj = {
      status: 'completed',
      progress: 100,
      output_path: '/api/output/' + finalVideoName,
      completed_at: timestamp
    };
    finalStatus.write(toJSON(finalObj));
    finalStatus.close();
    
    try {
      app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES);
      $.sleep(100);
      app.quit();
    } catch(quitErr) {}


  } catch (e) {
    var errorMsg = e.toString() + ' (Linea: ' + e.line + ')';
    alert('CRASH: ' + errorMsg);
    log('💥 CRASH: ' + errorMsg);
    updateStatus(0, 'failed', errorMsg);
  }


})();
