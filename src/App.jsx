import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Upload, Download, Save, Edit3, Music, FileText, Trash2, Cloud, AlertCircle, CheckCircle } from 'lucide-react';

const ChordMapperApp = () => {
  const [pdfFile, setPdfFile] = useState(null);
  const [extractedText, setExtractedText] = useState('');
  const [chordMap, setChordMap] = useState({
    title: '',
    key: '',
    tempo: '4/4',
    intro: '',
    verse: '',
    chorus: '',
    bridge: '',
    outro: '',
    structure: ''
  });
  const [savedMaps, setSavedMaps] = useState([]);
  const [currentTab, setCurrentTab] = useState('upload');
  const [isProcessing, setIsProcessing] = useState(false);
  const [googleDriveAuth, setGoogleDriveAuth] = useState(false);
  const [processingStep, setProcessingStep] = useState('');
  const fileInputRef = useRef(null);

  // Carica dati salvati all'avvio
  useEffect(() => {
    const saved = localStorage.getItem('chordMaps');
    if (saved) {
      setSavedMaps(JSON.parse(saved));
    }
  }, []);

  // OCR Reale con Tesseract.js
  const performOCR = async (file) => {
    setProcessingStep('Inizializzazione OCR...');
    
    try {
      // Importa Tesseract dinamicamente
      const Tesseract = await import('tesseract.js');
      
      setProcessingStep('Lettura del PDF...');
      
      // Converti PDF in immagine usando PDF.js (incluso via CDN)
      const pdfjsLib = window.pdfjsLib;
      if (!pdfjsLib) {
        throw new Error('PDF.js non caricato. Aggiungi lo script nel HTML.');
      }

      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      
      let fullText = '';
      const numPages = Math.min(pdf.numPages, 3); // Processa max 3 pagine
      
      for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        setProcessingStep(`Elaborazione pagina ${pageNum}/${numPages}...`);
        
        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale: 2.0 });
        
        // Crea canvas per rendering
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        
        // Renderizza pagina
        await page.render({ canvasContext: context, viewport }).promise;
        
        // OCR sulla pagina
        const { data: { text } } = await Tesseract.recognize(canvas, 'eng+ita', {
          logger: m => {
            if (m.status === 'recognizing text') {
              setProcessingStep(`OCR pagina ${pageNum}: ${Math.round(m.progress * 100)}%`);
            }
          }
        });
        
        fullText += text + '\n\n';
      }
      
      return fullText;
      
    } catch (error) {
      console.error('Errore OCR:', error);
      throw new Error(`Errore OCR: ${error.message}`);
    }
  };

  // Upload e processing PDF
  const handlePDFUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    if (file.type !== 'application/pdf') {
      alert('Per favore seleziona un file PDF');
      return;
    }
    
    if (file.size > 10 * 1024 * 1024) { // 10MB limit
      alert('File troppo grande. Massimo 10MB');
      return;
    }

    setPdfFile(file);
    setIsProcessing(true);
    setProcessingStep('Preparazione...');
    
    try {
      const text = await performOCR(file);
      setExtractedText(text);
      setProcessingStep('Analisi del contenuto...');
      await autoParseToChordMap(text);
      setCurrentTab('edit');
      setProcessingStep('Completato!');
    } catch (error) {
      console.error('Errore elaborazione:', error);
      alert(`Errore: ${error.message}`);
    } finally {
      setIsProcessing(false);
      setProcessingStep('');
    }
  };

  // Parser musicalmente intelligente
  const autoParseToChordMap = async (text) => {
    const lines = text.split('\n').filter(line => line.trim());
    const map = { ...chordMap };
    
    setProcessingStep('Analisi musicale intelligente...');
    
    // Estrai tutti gli accordi dal testo
    const allChords = extractAllChords(text);
    const chordSequences = groupChordSequences(allChords, text);
    
    // Analisi strutturale intelligente
    const musicalAnalysis = analyzeMusicalStructure(chordSequences, text);
    
    // Estrai metadati
    extractMetadata(lines, map);
    
    // Applica l'analisi intelligente
    map.intro = musicalAnalysis.intro || '';
    map.verse = musicalAnalysis.verse || '';
    map.chorus = musicalAnalysis.chorus || '';
    map.bridge = musicalAnalysis.bridge || '';
    map.outro = musicalAnalysis.outro || '';
    map.structure = musicalAnalysis.structure || 'Intro → A × 2 → B → A → B → Bridge → B × 2 → Outro';
    
    setChordMap(map);
  };

  // Estrazione accordi migliorata
  const extractAllChords = (text) => {
    // Pattern più sofisticato per accordi
    const chordPattern = /\b([A-G](?:#|b|♯|♭)?(?:maj|min|m|M|\+|-|dim|aug|sus|add|°|ø)?[0-9]*(?:\/[A-G](?:#|b|♯|♭)?)?)\b/g;
    const chords = [];
    let match;
    
    while ((match = chordPattern.exec(text)) !== null) {
      chords.push({
        chord: match[1],
        position: match.index,
        context: text.substring(Math.max(0, match.index - 20), match.index + 20)
      });
    }
    
    return chords;
  };

  // Raggruppa accordi in sequenze logiche
  const groupChordSequences = (chords, text) => {
    const lines = text.split('\n');
    const sequences = [];
    
    lines.forEach((line, lineIndex) => {
      const lineChords = chords.filter(c => 
        text.split('\n').slice(0, lineIndex + 1).join('\n').length >= c.position &&
        text.split('\n').slice(0, lineIndex).join('\n').length < c.position
      );
      
      if (lineChords.length >= 2) {
        sequences.push({
          line: lineIndex,
          chords: lineChords.map(c => c.chord),
          rawText: line.trim(),
          intensity: calculateHarmonicIntensity(lineChords.map(c => c.chord))
        });
      }
    });
    
    return sequences;
  };

  // Calcola intensità armonica
  const calculateHarmonicIntensity = (chords) => {
    let intensity = 0;
    
    chords.forEach(chord => {
      // Accordi più complessi = maggiore intensità
      if (chord.includes('7') || chord.includes('9') || chord.includes('11')) intensity += 2;
      if (chord.includes('maj') || chord.includes('M')) intensity += 1;
      if (chord.includes('min') || chord.includes('m')) intensity += 0.5;
      if (chord.includes('dim') || chord.includes('aug')) intensity += 3;
      if (chord.includes('/')) intensity += 1; // Inversioni
    });
    
    return intensity / chords.length;
  };

  // Analisi strutturale musicale intelligente
  const analyzeMusicalStructure = (sequences, fullText) => {
    if (sequences.length === 0) return {};
    
    const analysis = {
      intro: '',
      verse: '',
      chorus: '',
      bridge: '',
      outro: '',
      structure: ''
    };

    // 1. INTRO: Prime sequenze (di solito più semplici)
    const introSequences = sequences.slice(0, Math.min(3, Math.ceil(sequences.length * 0.15)));
    if (introSequences.length > 0) {
      analysis.intro = introSequences.map(s => s.chords.join(' - ')).join(' | ');
    }

    // 2. VERSO: Pattern che si ripete con intensità medio-bassa
    const versePatterns = findRepeatingPatterns(sequences, 'verse');
    if (versePatterns.length > 0) {
      analysis.verse = `𝄆 ${versePatterns[0].chords.join(' - ')} 𝄇`;
    }

    // 3. CHORUS: Sezioni con intensità armonica più alta
    const chorusPatterns = findRepeatingPatterns(sequences, 'chorus');
    if (chorusPatterns.length > 0) {
      analysis.chorus = `𝄆 ${chorusPatterns[0].chords.join(' - ')} 𝄇`;
    }

    // 4. BRIDGE: Sezione contrastante (di solito verso il centro)
    const bridgeSection = findBridgeSection(sequences);
    if (bridgeSection) {
      analysis.bridge = bridgeSection.chords.join(' - ');
    }

    // 5. OUTRO: Ultime sequenze
    const outroSequences = sequences.slice(-Math.min(2, Math.ceil(sequences.length * 0.1)));
    if (outroSequences.length > 0) {
      analysis.outro = outroSequences.map(s => s.chords.join(' - ')).join(' | ');
    }

    // Genera struttura intelligente
    analysis.structure = generateIntelligentStructure(analysis, sequences.length);

    return analysis;
  };

  // Trova pattern ripetuti
  const findRepeatingPatterns = (sequences, type) => {
    const patterns = [];
    const minRepeats = 2;
    
    for (let i = 0; i < sequences.length - 1; i++) {
      for (let j = i + 1; j < sequences.length; j++) {
        const seq1 = sequences[i];
        const seq2 = sequences[j];
        
        // Controlla similarità armonica
        if (areSimilarChordSequences(seq1.chords, seq2.chords)) {
          // Filtra per tipo (verse = intensità bassa, chorus = alta)
          if (type === 'verse' && seq1.intensity < 1.5) {
            patterns.push(seq1);
            break;
          } else if (type === 'chorus' && seq1.intensity >= 1.5) {
            patterns.push(seq1);
            break;
          }
        }
      }
    }
    
    return patterns.slice(0, 1); // Ritorna il primo pattern trovato
  };

  // Controlla similarità tra sequenze di accordi
  const areSimilarChordSequences = (chords1, chords2) => {
    if (Math.abs(chords1.length - chords2.length) > 2) return false;
    
    let matches = 0;
    const minLength = Math.min(chords1.length, chords2.length);
    
    for (let i = 0; i < minLength; i++) {
      if (chords1[i] === chords2[i] || 
          normalizeChord(chords1[i]) === normalizeChord(chords2[i])) {
        matches++;
      }
    }
    
    return matches / minLength >= 0.6; // 60% di similarità
  };

  // Normalizza accordi per confronto
  const normalizeChord = (chord) => {
    return chord.replace(/maj|M/, '').replace(/min|m/, 'm').replace(/7|9|11|13/, '');
  };

  // Trova sezione bridge
  const findBridgeSection = (sequences) => {
    const middleStart = Math.floor(sequences.length * 0.4);
    const middleEnd = Math.floor(sequences.length * 0.7);
    const middleSequences = sequences.slice(middleStart, middleEnd);
    
    // Cerca la sezione più diversa armonicamente
    let mostUnique = null;
    let maxUniqueness = 0;
    
    middleSequences.forEach(seq => {
      let uniqueness = calculateUniqueness(seq, sequences);
      if (uniqueness > maxUniqueness) {
        maxUniqueness = uniqueness;
        mostUnique = seq;
      }
    });
    
    return mostUnique;
  };

  // Calcola unicità di una sezione
  const calculateUniqueness = (targetSeq, allSequences) => {
    let uniqueness = 0;
    
    allSequences.forEach(seq => {
      if (seq !== targetSeq) {
        const similarity = areSimilarChordSequences(targetSeq.chords, seq.chords) ? 1 : 0;
        uniqueness += (1 - similarity);
      }
    });
    
    return uniqueness / (allSequences.length - 1);
  };

  // Estrae metadati (titolo, tonalità, tempo)
  const extractMetadata = (lines, map) => {
    let foundTitle = false;
    
    lines.forEach((line, index) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      
      // Titolo (prima riga significativa)
      if (!foundTitle && index < 5 && /^[A-Za-z\s\-'".,!?]+$/.test(trimmed) && 
          trimmed.length > 3 && trimmed.length < 50 && !trimmed.includes('=')) {
        map.title = trimmed;
        foundTitle = true;
        return;
      }
      
      // Tempo
      const tempoMatch = trimmed.match(/[♩♪♫]?\s*=\s*([0-9]+)/);
      if (tempoMatch) {
        map.tempo = `♩ = ${tempoMatch[1]}`;
      }
      
      // Tonalità (dedotta dal primo accordo significativo)
      if (!map.key) {
        const firstChordMatch = trimmed.match(/\b([A-G](?:#|b)?(?:maj|min|m|M)?)\b/);
        if (firstChordMatch) {
          const rootNote = firstChordMatch[1].replace(/maj|min|m|M/, '');
          const quality = firstChordMatch[1].includes('min') || firstChordMatch[1].includes('m') ? ' min' : ' maj';
          map.key = rootNote + quality;
        }
      }
    });
  };

  // Genera struttura intelligente
  const generateIntelligentStructure = (analysis, totalSequences) => {
    const parts = [];
    
    if (analysis.intro) parts.push('Intro');
    if (analysis.verse) parts.push('A');
    if (analysis.chorus) parts.push('B');
    
    // Struttura tipica basata sulla lunghezza
    if (totalSequences < 10) {
      return 'Intro → A → B → A → B → Outro';
    } else if (totalSequences < 20) {
      return 'Intro → A × 2 → B → A → B → Bridge → B × 2 → Outro';
    } else {
      return 'Intro → A × 2 → B → A → B → Bridge → Solo → B × 3 → Outro';
    }
  };

  // Salvataggio locale e Google Drive
  const saveChordMap = async () => {
    if (!chordMap.title) {
      alert('Inserisci almeno il titolo del brano');
      return;
    }
    
    const newMap = {
      ...chordMap,
      id: Date.now(),
      lastModified: new Date().toISOString(),
      filename: `${chordMap.title.replace(/[^a-zA-Z0-9]/g, '_')}_chord_map`
    };
    
    const updatedMaps = [...savedMaps, newMap];
    setSavedMaps(updatedMaps);
    
    // Salva localmente
    localStorage.setItem('chordMaps', JSON.stringify(updatedMaps));
    
    // Salva su Google Drive se autenticato
    if (googleDriveAuth) {
      await saveToGoogleDrive(newMap);
    }
    
    alert('Mappa salvata con successo!');
  };

  // Google Drive Integration (semplificata)
  const initGoogleDrive = async () => {
    try {
      // Questa è una versione semplificata
      // In produzione useresti l'API Google Drive completa
      setGoogleDriveAuth(true);
      alert('Connessione a Google Drive simulata (implementazione completa richiede setup OAuth)');
    } catch (error) {
      console.error('Errore Google Drive:', error);
      alert('Errore connessione Google Drive');
    }
  };

  const saveToGoogleDrive = async (chordMap) => {
    if (!googleDriveAuth) return;
    
    try {
      // Simulazione salvataggio Google Drive
      console.log('Salvando su Google Drive:', chordMap.filename);
      // Qui implementeresti la chiamata API reale
    } catch (error) {
      console.error('Errore salvataggio Google Drive:', error);
    }
  };

  const loadChordMap = (map) => {
    setChordMap(map);
    setCurrentTab('edit');
  };

  const deleteChordMap = (id) => {
    const updatedMaps = savedMaps.filter(map => map.id !== id);
    setSavedMaps(updatedMaps);
    localStorage.setItem('chordMaps', JSON.stringify(updatedMaps));
  };

  const exportChordMap = () => {
    const exportData = {
      title: chordMap.title,
      key: chordMap.key,
      tempo: chordMap.tempo,
      sections: {
        intro: chordMap.intro,
        verse: chordMap.verse,
        chorus: chordMap.chorus,
        bridge: chordMap.bridge,
        outro: chordMap.outro
      },
      structure: chordMap.structure,
      exportDate: new Date().toISOString()
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: 'application/json'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${chordMap.title.replace(/\s+/g, '_')}_chord_map.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const copyToClipboard = () => {
    const mapText = formatChordMapForCopy();
    navigator.clipboard.writeText(mapText).then(() => {
      alert('Mappa copiata negli appunti!');
    });
  };

  const formatChordMapForCopy = () => {
    return `${chordMap.title.toUpperCase()}
Tonalità: ${chordMap.key}
Tempo: ${chordMap.tempo}

INTRO: ${chordMap.intro}

VERSE (A): 𝄆 ${chordMap.verse} 𝄇
CHORUS (B): 𝄆 ${chordMap.chorus} 𝄇

STRUTTURA: ${chordMap.structure}

BRIDGE: ${chordMap.bridge}
OUTRO: ${chordMap.outro}`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Music className="w-8 h-8 text-indigo-600" />
              <div>
                <h1 className="text-3xl font-bold text-gray-800">Chord Mapper Pro</h1>
                <p className="text-gray-600">Converti spartiti PDF in mappe degli accordi</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              {googleDriveAuth ? (
                <div className="flex items-center gap-2 text-green-600">
                  <CheckCircle className="w-5 h-5" />
                  <span className="text-sm">Google Drive</span>
                </div>
              ) : (
                <button
                  onClick={initGoogleDrive}
                  className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <Cloud className="w-4 h-4" />
                  Connetti Drive
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="bg-white rounded-xl shadow-lg mb-6">
          <div className="flex border-b">
            {[
              { id: 'upload', label: 'Carica PDF', icon: Upload },
              { id: 'edit', label: 'Editor', icon: Edit3 },
              { id: 'saved', label: 'Salvate', icon: FileText }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setCurrentTab(tab.id)}
                className={`flex items-center gap-2 px-6 py-4 font-medium transition-colors ${
                  currentTab === tab.id
                    ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50'
                    : 'text-gray-600 hover:text-indigo-600 hover:bg-gray-50'
                }`}
              >
                <tab.icon className="w-5 h-5" />
                {tab.label}
              </button>
            ))}
          </div>

          <div className="p-6">
            {/* Upload Tab */}
            {currentTab === 'upload' && (
              <div className="space-y-6">
                <div className="border-2 border-dashed border-indigo-300 rounded-xl p-8 text-center">
                  <Upload className="w-12 h-12 text-indigo-400 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-gray-800 mb-2">
                    Carica il tuo spartito PDF
                  </h3>
                  <p className="text-gray-600 mb-4">
                    OCR automatico per estrarre accordi e creare mappe strutturate
                  </p>
                  <p className="text-sm text-gray-500 mb-4">
                    Formati supportati: PDF (max 10MB) • Lingue: Italiano, Inglese
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf"
                    onChange={handlePDFUpload}
                    className="hidden"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isProcessing}
                    className="bg-indigo-600 text-white px-6 py-3 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isProcessing ? 'Elaborazione...' : 'Seleziona PDF'}
                  </button>
                </div>

                {isProcessing && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <div className="flex items-center gap-3">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                      <div>
                        <div className="text-blue-800 font-medium">Elaborazione in corso...</div>
                        {processingStep && (
                          <div className="text-blue-600 text-sm">{processingStep}</div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {extractedText && !isProcessing && (
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h4 className="font-semibold text-gray-800 mb-2 flex items-center gap-2">
                      <CheckCircle className="w-5 h-5 text-green-600" />
                      Testo estratto con successo:
                    </h4>
                    <pre className="text-sm text-gray-700 whitespace-pre-wrap max-h-40 overflow-y-auto bg-white p-3 rounded border">
                      {extractedText.substring(0, 500)}
                      {extractedText.length > 500 && '...'}
                    </pre>
                    <p className="text-xs text-gray-500 mt-2">
                      {extractedText.length} caratteri estratti • Passa alla tab "Editor" per modificare
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Edit Tab */}
            {currentTab === 'edit' && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <input
                    type="text"
                    placeholder="Titolo del brano"
                    value={chordMap.title}
                    onChange={(e) => setChordMap(prev => ({ ...prev, title: e.target.value }))}
                    className="col-span-2 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-lg font-medium"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      placeholder="Es: C maj"
                      value={chordMap.key}
                      onChange={(e) => setChordMap(prev => ({ ...prev, key: e.target.value }))}
                      className="px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                    <input
                      type="text"
                      placeholder="4/4"
                      value={chordMap.tempo}
                      onChange={(e) => setChordMap(prev => ({ ...prev, tempo: e.target.value }))}
                      className="px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {[
                    { key: 'intro', label: '🎵 INTRO', placeholder: 'Em7 - G - D - C', color: 'blue' },
                    { key: 'verse', label: '📝 VERSE (A)', placeholder: 'Accordi della strofa', color: 'green' },
                    { key: 'chorus', label: '🎤 CHORUS (B)', placeholder: 'Accordi del ritornello', color: 'purple' },
                    { key: 'bridge', label: '🌉 BRIDGE', placeholder: 'Accordi del ponte', color: 'orange' },
                    { key: 'outro', label: '🏁 OUTRO', placeholder: 'Accordi finali', color: 'red' }
                  ].map(section => (
                    <div key={section.key} className="space-y-2">
                      <label className={`block text-sm font-semibold text-${section.color}-700`}>
                        {section.label}
                      </label>
                      <textarea
                        placeholder={section.placeholder}
                        value={chordMap[section.key]}
                        onChange={(e) => setChordMap(prev => ({ ...prev, [section.key]: e.target.value }))}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none font-mono"
                        rows={2}
                      />
                    </div>
                  ))}
                  
                  <div className="md:col-span-2 space-y-2">
                    <label className="block text-sm font-semibold text-gray-700">
                      🗺️ STRUTTURA DEL BRANO
                    </label>
                    <textarea
                      placeholder="Intro → A × 2 → B → A → B → Bridge → B × 2 → Outro"
                      value={chordMap.structure}
                      onChange={(e) => setChordMap(prev => ({ ...prev, structure: e.target.value }))}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none"
                      rows={2}
                    />
                    <p className="text-xs text-gray-500">
                      Usa simboli: 𝄆 𝄇 (ripetizione), × (volte), → (poi), D.C. (da capo), D.S. (dal segno)
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-3 pt-4 border-t">
                  <button
                    onClick={saveChordMap}
                    disabled={!chordMap.title}
                    className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Save className="w-4 h-4" />
                    Salva Mappa
                  </button>
                  <button
                    onClick={exportChordMap}
                    disabled={!chordMap.title}
                    className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                  >
                    <Download className="w-4 h-4" />
                    Esporta JSON
                  </button>
                  <button
                    onClick={copyToClipboard}
                    disabled={!chordMap.title}
                    className="flex items-center gap-2 bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50"
                  >
                    <FileText className="w-4 h-4" />
                    Copia Testo
                  </button>
                </div>

                {/* Preview */}
                {chordMap.title && (
                  <div className="bg-gray-50 rounded-lg p-6 mt-6">
                    <h3 className="font-bold text-lg text-gray-800 mb-4 flex items-center gap-2">
                      <Music className="w-5 h-5" />
                      Anteprima Mappa:
                    </h3>
                    <pre className="text-sm font-mono text-gray-700 whitespace-pre-wrap bg-white p-4 rounded border shadow-sm">
                      {formatChordMapForCopy()}
                    </pre>
                  </div>
                )}
              </div>
            )}

            {/* Saved Tab */}
            {currentTab === 'saved' && (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h2 className="text-xl font-semibold text-gray-800">Le tue mappe salvate</h2>
                  <div className="text-sm text-gray-500">
                    {savedMaps.length} {savedMaps.length === 1 ? 'mappa' : 'mappe'}
                  </div>
                </div>
                
                {savedMaps.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <FileText className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                    <p className="text-lg mb-2">Nessuna mappa salvata ancora</p>
                    <p className="text-sm">Carica un PDF o crea manualmente la tua prima mappa</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {savedMaps.map(map => (
                      <div key={map.id} className="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-lg transition-shadow">
                        <div className="mb-4">
                          <h4 className="font-semibold text-gray-800 text-lg mb-2 truncate">{map.title}</h4>
                          <div className="space-y-1 text-sm text-gray-600">
                            <p>🎵 Tonalità: <span className="font-medium">{map.key || 'Non specificata'}</span></p>
                            <p>⏱️ Tempo: <span className="font-medium">{map.tempo}</span></p>
                            <p className="text-xs text-gray-500">
                              💾 {new Date(map.lastModified).toLocaleDateString('it-IT', {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </p>
                          </div>
                        </div>
                        
                        {/* Preview delle sezioni */}
                        <div className="mb-4 text-xs text-gray-500 space-y-1">
                          {map.intro && <p>• Intro presente</p>}
                          {map.verse && <p>• Verse presente</p>}
                          {map.chorus && <p>• Chorus presente</p>}
                          {map.bridge && <p>• Bridge presente</p>}
                        </div>
                        
                        <div className="flex gap-2">
                          <button
                            onClick={() => loadChordMap(map)}
                            className="flex-1 bg-indigo-600 text-white px-3 py-2 rounded text-sm hover:bg-indigo-700 transition-colors"
                          >
                            Modifica
                          </button>
                          <button
                            onClick={() => {
                              setChordMap(map);
                              copyToClipboard();
                            }}
                            className="bg-purple-600 text-white px-3 py-2 rounded text-sm hover:bg-purple-700 transition-colors"
                            title="Copia negli appunti"
                          >
                            📋
                          </button>
                          <button
                            onClick={() => deleteChordMap(map.id)}
                            className="bg-red-600 text-white p-2 rounded hover:bg-red-700 transition-colors"
                            title="Elimina"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChordMapperApp;
