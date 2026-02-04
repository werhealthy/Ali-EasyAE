// ============================================
// SCRIPT: render_aliradar.jsx - FINAL FIX V6
// ============================================

(function() {

var BASE_FOLDER = '/Users/francesco.cerisano/Documents/GitHub/Ali-EasyAE';
var TEMP_DATA_DIR = BASE_FOLDER + '/_temp_data';
var LOG_FILE_PATH = TEMP_DATA_DIR + '/production_log.txt';
var logFile = new File(LOG_FILE_PATH);

function initLog() {
  logFile.encoding = "UTF-8";
  logFile.open('w');
  logFile.write("========================================\n");
  logFile.write("ALIRADAR LOG - " + new Date().toString() + "\n");
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

try {
  initLog();
  
  // ✅ 1. LEGGI JSON
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
  log("  hero_tag: " + (jobData.hero_tag || 'N/A'));
  log("  hero_title: " + (jobData.hero_title || 'N/A'));
  log("  season: " + (jobData.season || 'inverno'));
  log("  num products: " + (jobData.products ? jobData.products.length : 0));
  
  // ✅ 2. APRI TEMPLATE
  log("\n🔍 Apro template...");
  var templateFile = new File(jobData.template_aep_path);
  if (!templateFile.exists) throw new Error("Template non trovato");
  app.open(templateFile);
  log("✅ Template aperto");
  
  // ✅ 3. TROVA COMP
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
  
  // ✅ 4. TROVA LAYER PRINCIPALI
  log("\n🔍 Cerco layer principali...");
  var grpHero = null;
  var productBlock = null;
  var grpOutros = null;
  
  for (var i = 1; i <= comp.numLayers; i++) {
    var layer = comp.layer(i);
    if (layer.name === "GRP_HERO") grpHero = layer;
    if (layer.name === "PRODUCT_BLOCK") productBlock = layer;
    if (layer.name === "GRP_OUTROS") grpOutros = layer;
  }
  
  log("grpHero: " + (grpHero ? "✅" : "❌"));
  log("productBlock: " + (productBlock ? "✅" : "❌"));
  log("grpOutros: " + (grpOutros ? "✅" : "❌"));
  
  if (!productBlock) throw new Error("PRODUCT_BLOCK non trovato");
  
  // ✅ 5. DURATE
  var PRODUCT_DURATION = 3;
  var LAST_PRODUCT_DURATION = 5;  // ✅ Ultimo prodotto 5s
  var HERO_DURATION = 3;
  var OUTRO_DURATION = 3;
  var numProducts = jobData.products ? jobData.products.length : 0;
  
  if (numProducts === 0) throw new Error("Nessun prodotto trovato!");
  
  log("\n📊 CONFIGURAZIONE:");
  log("  Prodotto standard: " + PRODUCT_DURATION + "s");
  log("  Ultimo prodotto: " + LAST_PRODUCT_DURATION + "s");
  log("  Hero: " + HERO_DURATION + "s");
  log("  Outro: " + OUTRO_DURATION + "s");
  log("  Numero prodotti: " + numProducts);
  
  // ✅ 6. CALCOLO DURATA TOTALE
  // (numProducts-1) prodotti da 3s + ultimo da 5s
  var totalDuration = (numProducts - 1) * PRODUCT_DURATION + LAST_PRODUCT_DURATION;
  var outroStartTime = totalDuration - OUTRO_DURATION;
  
  log("\n⏱️ CALCOLO DURATE:");
  log("  Hero (SOVRAPPOSTO): 0s - " + HERO_DURATION + "s");
  
  var prodTime = 0;
  for (var i = 0; i < numProducts; i++) {
    var isLast = (i === numProducts - 1);
    var dur = isLast ? LAST_PRODUCT_DURATION : PRODUCT_DURATION;
    log("  Prodotto " + (i+1) + ": " + prodTime + "s - " + (prodTime + dur) + "s (" + dur + "s)");
    prodTime += dur;
  }
  
  log("  Outro (SOVRAPPOSTO): " + outroStartTime + "s - " + totalDuration + "s (" + OUTRO_DURATION + "s)");
  log("  TOTALE VIDEO: " + totalDuration + "s");
  
  // ✅ 7. DISABILITA TEMPLATE
  productBlock.enabled = false;
  log("\n✅ Template disabilitato");
  
  // ✅ 8. DUPLICA PRODOTTI
  log("\n📦 CREAZIONE PRODOTTI...");
  var currentTime = 0;
  var createdLayers = [];
  
  for (var i = 0; i < numProducts; i++) {
    var product = jobData.products[i];
    var isLast = (i === numProducts - 1);
    var thisDuration = isLast ? LAST_PRODUCT_DURATION : PRODUCT_DURATION;
    
    log("\n========================================");
    log("PRODOTTO " + (i+1) + "/" + numProducts + (isLast ? " (ULTIMO)" : ""));
    log("Nome: " + product.name);
    log("Video: " + product.video_url);
    log("Durata: " + thisDuration + "s");
    log("========================================");
    
    var newProductLayer = productBlock.duplicate();
    newProductLayer.name = "Product_" + (i + 1);
    newProductLayer.startTime = currentTime;
    newProductLayer.enabled = true;
    
    createdLayers.push(newProductLayer);
    
    log("✅ Duplicato @ " + currentTime + "s");
    
        // ✅ VIDEO - DUPLICA PRECOMP
    if (newProductLayer.source instanceof CompItem) {
      log("🔍 Duplico precomp prodotto...");
      var originalComp = newProductLayer.source;
      var newComp = originalComp.duplicate();
      newComp.name = "Product_" + (i + 1) + "_Comp";
      newProductLayer.replaceSource(newComp, false);
      log("✅ Precomp duplicata: " + newComp.name);
      
      // SOSTITUISCI VIDEO
      log("🔍 Cerco GRP_INPUT_VIDEO...");
      var grpInputVideo = null;
      for (var l = 1; l <= newComp.numLayers; l++) {
        if (newComp.layer(l).name === "GRP_INPUT_VIDEO") {
          grpInputVideo = newComp.layer(l);
          break;
        }
      }
      
            if (grpInputVideo && product.video_url) {
        log("✅ GRP_INPUT_VIDEO trovato");
        var videoFile = new File(product.video_url);
        
        if (videoFile.exists) {
          var importOptions = new ImportOptions(videoFile);
          var newFootage = app.project.importFile(importOptions);
          
          if (grpInputVideo.source && grpInputVideo.source instanceof FootageItem) {
            grpInputVideo.replaceSource(newFootage, false);
            log("✅ Video sostituito");
            
            // ✅ SCALING COVER (riempire la comp)
            try {
              var compRatio = newComp.width / newComp.height;
              var videoRatio = newFootage.width / newFootage.height;
              var scaleToFill;
              
              if (videoRatio < compRatio) {
                // Video più stretto della comp: scala sulla larghezza
                scaleToFill = (newComp.width / newFootage.width) * 100;
              } else {
                // Video più largo della comp: scala sull'altezza
                scaleToFill = (newComp.height / newFootage.height) * 100;
              }
              
              grpInputVideo.property("Transform").property("Scale").setValue([scaleToFill, scaleToFill]);
              grpInputVideo.property("Transform").property("Position").setValue([newComp.width/2, newComp.height/2]);
              
              log("  ✅ Video scalato (cover): " + scaleToFill.toFixed(2) + "%");
              log("    Comp: " + newComp.width + "x" + newComp.height + " (ratio: " + compRatio.toFixed(2) + ")");
              log("    Video: " + newFootage.width + "x" + newFootage.height + " (ratio: " + videoRatio.toFixed(2) + ")");
            } catch(e) {
              log("  ⚠️ Errore scaling: " + e.toString());
            }
          } else {
            log("⚠️ GRP_INPUT_VIDEO non è FootageItem, lo sostituisco");
            grpInputVideo.remove();
            var newVideoLayer = newComp.layers.add(newFootage);
            newVideoLayer.name = "GRP_INPUT_VIDEO";
            newVideoLayer.moveBefore(newComp.layer(1));
            
            // ✅ SCALING COVER (riempire la comp)
            try {
              var compRatio = newComp.width / newComp.height;
              var videoRatio = newFootage.width / newFootage.height;
              var scaleToFill;
              
              if (videoRatio < compRatio) {
                scaleToFill = (newComp.width / newFootage.width) * 100;
              } else {
                scaleToFill = (newComp.height / newFootage.height) * 100;
              }
              
              newVideoLayer.property("Transform").property("Scale").setValue([scaleToFill, scaleToFill]);
              newVideoLayer.property("Transform").property("Position").setValue([newComp.width/2, newComp.height/2]);
              
              log("  ✅ Video scalato (cover): " + scaleToFill.toFixed(2) + "%");
            } catch(e) {
              log("  ⚠️ Errore scaling: " + e.toString());
            }
            
            log("✅ Nuovo video layer creato e scalato");

          }
        } else {
          log("❌ Video non esiste: " + product.video_url);
        }
      }
      
      // ✅ IMPOSTA NOME PRODOTTO
      log("🔍 Cerco nome prodotto...");
      var grpLabel = null;
      for (var l = 1; l <= newComp.numLayers; l++) {
        if (newComp.layer(l).name === "GRP_LABEL") {
          grpLabel = newComp.layer(l);
          break;
        }
      }
      
      if (grpLabel) {
        log("  ✅ GRP_LABEL trovato");
        
        // ✅✅✅ DUPLICA LA PRECOMP DI GRP_LABEL (FIX NOMI!)
        if (grpLabel.source instanceof CompItem) {
          log("  🔍 Duplico precomp GRP_LABEL...");
          var originalLabelComp = grpLabel.source;
          var newLabelComp = originalLabelComp.duplicate();
          newLabelComp.name = "Product_" + (i + 1) + "_Label";
          grpLabel.replaceSource(newLabelComp, false);
          log("  ✅ Precomp label duplicata: " + newLabelComp.name);
          
          // ✅ POSIZIONA LABEL IN BASE ALL'INDICE
          try {
            var labelPosition = grpLabel.property("Transform").property("Position");
            var currentPos = labelPosition.value;
            
            log("  📍 Posizione corrente: [" + currentPos[0] + ", " + currentPos[1] + "]");
            
            if (i === 0) {
              // Prodotto 1: Default (non cambiare)
              log("  ℹ️ Posizione default mantenuta");
            } else if (i === 1) {
              // Prodotto 2: Basso centro-sinistra
              var newX = comp.width * 0.40;
              var newY = comp.height * 0.70;
              labelPosition.setValue([newX, newY]);
              log("  ✅ Posizione: BASSO CENTRO (" + newX + ", " + newY + ")");
            } else if (i === 2) {
              // Prodotto 3: Alto destra
              var newX = comp.width * 0.70;
              var newY = comp.height * 0.35;
              labelPosition.setValue([newX, newY]);
              log("  ✅ Posizione: ALTO DESTRA (" + newX + ", " + newY + ")");
            }
          } catch(e) {
            log("  ⚠️ Errore posizionamento label: " + e.toString());
          }
          
          // ✅ IMPOSTA TESTO NELLA NUOVA PRECOMP
          var labelBox = null;
          for (var l = 1; l <= newLabelComp.numLayers; l++) {
            if (newLabelComp.layer(l).name === "LABEL_BOX") {
              labelBox = newLabelComp.layer(l);
              break;
            }
          }
          
          if (labelBox) {
            log("  ✅ LABEL_BOX trovato");
            
            // ✅✅✅ DUPLICA ANCHE LABEL_BOX SE È UNA PRECOMP!
            if (labelBox.source instanceof CompItem) {
              log("  🔍 LABEL_BOX è una precomp, la duplico...");
              var originalLabelBoxComp = labelBox.source;
              var newLabelBoxComp = originalLabelBoxComp.duplicate();
              newLabelBoxComp.name = "Product_" + (i + 1) + "_LabelBox";
              labelBox.replaceSource(newLabelBoxComp, false);
              log("  ✅ Precomp LABEL_BOX duplicata: " + newLabelBoxComp.name);
              
              // ✅ ORA CERCA IL TESTO NELLA NUOVA PRECOMP
              var productNameText = null;
              for (var l = 1; l <= newLabelBoxComp.numLayers; l++) {
                if (newLabelBoxComp.layer(l).name === "PRODUCT_NAME_TEXT") {
                  productNameText = newLabelBoxComp.layer(l);
                  break;
                }
              }
              
              if (productNameText && productNameText.property("Source Text")) {
                var textDoc3 = productNameText.property("Source Text").value;
                textDoc3.text = product.name;
                productNameText.property("Source Text").setValue(textDoc3);
                log("  ✅ Nome impostato: '" + product.name + "'");
                
                // ✅ VERIFICA NOME IMPOSTATO
                var verificaNome = productNameText.property("Source Text").value.text;
                log("  🔍 VERIFICA nome letto: '" + verificaNome + "'");
                
                if (verificaNome !== product.name) {
                  log("  ⚠️⚠️⚠️ NOME NON CORRISPONDE!");
                }
              } else {
                log("  ❌ PRODUCT_NAME_TEXT non trovato!");
              }
              
            } else {
              // ✅ LABEL_BOX non è precomp, cerca direttamente
              log("  ℹ️ LABEL_BOX non è precomp");
            }
          } else {
            log("  ⚠️ LABEL_BOX non trovato o non è precomp");
          }
        } else {
          log("  ⚠️ GRP_LABEL non è una precomp!");
        }
      } else {
        log("  ⚠️ GRP_LABEL non trovato!");
      }
    }
    
    // ✅ CROPPA A DURATA CORRETTA
    try {
      var cropOutPoint = currentTime + thisDuration;
      newProductLayer.inPoint = currentTime;
      newProductLayer.outPoint = cropOutPoint;
      log("✅ CROPPATO: inPoint=" + newProductLayer.inPoint + "s, outPoint=" + newProductLayer.outPoint + "s");
      log("  Durata effettiva: " + (newProductLayer.outPoint - newProductLayer.inPoint) + "s");
    } catch(e) {
      log("❌ Errore crop: " + e.toString());
    }
    
    currentTime += thisDuration;
    log("⏭️ Prossimo @ " + currentTime + "s");
  }
  
  // ✅ 9. HERO (SOVRAPPOSTO)
  log("\n🎬 HERO (sovrapposto)...");
  if (grpHero) {
    grpHero.startTime = 0;
    grpHero.enabled = true;
    log("✅ Hero posizionato @ 0s");
    
    // Hero Tag
    if (jobData.hero_tag && grpHero.source instanceof CompItem) {
      var txtHeroTag = null;
      for (var i = 1; i <= grpHero.source.numLayers; i++) {
        if (grpHero.source.layer(i).name === "TXT_HERO_TAG") {
          txtHeroTag = grpHero.source.layer(i);
          break;
        }
      }
      
      if (txtHeroTag && txtHeroTag.source instanceof CompItem) {
        var tagTextLayer = null;
        for (var i = 1; i <= txtHeroTag.source.numLayers; i++) {
          if (txtHeroTag.source.layer(i).name === "TAG_TEXT") {
            tagTextLayer = txtHeroTag.source.layer(i);
            break;
          }
        }
        
        if (tagTextLayer && tagTextLayer.property("Source Text")) {
          var textDoc = tagTextLayer.property("Source Text").value;
          textDoc.text = jobData.hero_tag.toUpperCase();
          tagTextLayer.property("Source Text").setValue(textDoc);
          log("✅ Hero Tag: '" + jobData.hero_tag + "'");
        }
      }
    }
    
    // Hero Title
    if (jobData.hero_title && grpHero.source instanceof CompItem) {
      var heroLineText = null;
      for (var i = 1; i <= grpHero.source.numLayers; i++) {
        if (grpHero.source.layer(i).name === "HERO_LINE_TEXT") {
          heroLineText = grpHero.source.layer(i);
          break;
        }
      }
      
      if (heroLineText && heroLineText.property("Source Text")) {
        var textDoc2 = heroLineText.property("Source Text").value;
        textDoc2.text = jobData.hero_title;
        heroLineText.property("Source Text").setValue(textDoc2);
        log("✅ Hero Title: " + jobData.hero_title);
      }
    }
  }
  
  // ✅ 10. OUTRO (SOVRAPPOSTO AGLI ULTIMI 3S + SOPRA A TUTTO!)
  log("\n🎬 OUTRO (sovrapposto agli ultimi 3s)...");
  if (grpOutros) {
    log("🔍 Configurazione GRP_OUTROS...");
    log("  Durata comp: " + totalDuration + "s");
    log("  Outro inizia @ " + outroStartTime + "s");
    
    // ✅ ENTRA NELLA PRECOMP E SISTEMA I LAYER
    if (grpOutros.source instanceof CompItem) {
      var outroComp = grpOutros.source;
      log("  Precomp duration: " + outroComp.duration + "s");
      
      // ✅ STAGIONE
      var season = jobData.season || 'inverno';
      log("  Stagione: " + season);
      
      var seasonMap = {
        'inverno': 'WINTER',
        'autunno': 'AUTUMN',
        'primavera': 'SPRING',
        'estate': 'SUMMER'
      };
      var targetKeyword = seasonMap[season.toLowerCase()] || 'WINTER';
      var targetLayerName = "MOD_OUTRO_" + targetKeyword;
      
      log("  Target layer: " + targetLayerName);
      
      // ✅ DISABILITA TUTTI I LAYER OUTRO
      for (var j = 1; j <= outroComp.numLayers; j++) {
        var ly = outroComp.layer(j);
        if (ly.name.indexOf("MOD_OUTRO_") !== -1) {
          ly.enabled = false;
          log("    ❌ " + ly.name);
        }
      }
      
      // ✅ ABILITA SOLO QUELLO GIUSTO
      var outroLayer = null;
      try {
        outroLayer = outroComp.layer(targetLayerName);
      } catch(e) {
        log("    ⚠️ Layer " + targetLayerName + " non trovato!");
      }
      
      if (outroLayer) {
        outroLayer.enabled = true;
        log("    ✅ Attivato: " + outroLayer.name);
        
        // ✅ CALCOLA DURATA OUTRO DAL LAYER ATTIVO
        var outroDuration = OUTRO_DURATION;
        if (outroLayer.source && outroLayer.source instanceof CompItem) {
          outroDuration = outroLayer.source.duration;
          log("    Durata da source: " + outroDuration + "s");
        } else {
          outroDuration = outroLayer.outPoint - outroLayer.inPoint;
          log("    Durata da layer timing: " + outroDuration + "s");
        }
        
        // ✅ RESET TIMING DEL LAYER NELLA PRECOMP
        outroLayer.startTime = 0;
        outroLayer.inPoint = 0;
        outroLayer.outPoint = outroComp.duration;
        
        // ✅ POSIZIONA GRP_OUTROS PER FAR COINCIDERE LA FINE
        grpOutros.enabled = true;
        
        // ✅ CALCOLA startTime per far coincidere la FINE
        var outroStartCalc = totalDuration - outroDuration;
        
        // ✅ Se l'outro è più lungo del video, fallo partire da 0
        if (outroStartCalc < 0) {
          log("  ⚠️ Outro più lungo del video, lo faccio partire da 0");
          grpOutros.startTime = 0;
          grpOutros.inPoint = 0;
          grpOutros.outPoint = totalDuration;
        } else {
          // ✅ Outro più corto: fallo partire per finire insieme al video
          grpOutros.startTime = outroStartCalc;
          grpOutros.inPoint = outroStartCalc;  // ✅ Visibile da questo punto
          grpOutros.outPoint = totalDuration;  // ✅ Finisce con il video
        }
        
        log("  📐 CALCOLI OUTRO:");
        log("    Durata outro (da layer): " + outroDuration + "s");
        log("    Durata video totale: " + totalDuration + "s");
        log("    StartTime: " + grpOutros.startTime + "s");
        log("    InPoint: " + grpOutros.inPoint + "s");
        log("    OutPoint: " + grpOutros.outPoint + "s");
        log("    Outro visibile: " + grpOutros.inPoint + "s → " + grpOutros.outPoint + "s");

        
        log("  📐 CALCOLI OUTRO:");
        log("    Durata outro (da layer): " + outroDuration + "s");
        log("    Durata video totale: " + totalDuration + "s");
        log("    StartTime calcolato: " + outroStartCalc + "s");
        log("    Outro visibile da: " + (outroStartCalc >= 0 ? outroStartCalc : 0) + "s a " + totalDuration + "s");

        
        log("  ✅ OUTRO POSIZIONATO:");
        log("    Layer: " + targetLayerName);
        log("    startTime: " + grpOutros.startTime + "s");
        log("    inPoint: " + grpOutros.inPoint + "s");
        log("    outPoint: " + grpOutros.outPoint + "s");
        log("    Durata visibile: " + (grpOutros.outPoint - grpOutros.inPoint) + "s");
      }
    }
    
    // ✅ PORTA L'OUTRO IN CIMA A TUTTO (SOPRA HERO!)
    grpOutros.moveToBeginning();
    log("  ✅ Outro spostato in cima (index: " + grpOutros.index + ")");
    
    log("✅ Outro configurato");
  } else {
    log("⚠️ GRP_OUTROS non trovato");
  }
  
  // ✅ 11. IMPOSTA DURATA COMP
  comp.duration = totalDuration;
  log("\n✅ Durata comp: " + comp.duration + "s");
  
  // ✅ 12. RENDER
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
  
  // ✅ 13. CHIUSURA PULITA
  log("🚪 Chiusura After Effects...");
  
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
