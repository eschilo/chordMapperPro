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

  // Parser intelligente per accordi
  const autoParseToChordMap = async (text) => {
    const lines = text.split('\n').filter(line => line.trim());
    const map = { ...chordMap };
    
    // Pattern per riconoscere accordi
    const chordPattern = /\b([A-G](?:#|b)?(?:maj|min|m|M|\+|-|dim|aug|sus|add)?[0-9]*(?:\/[A-G](?:#|b)?)?)\b/g;
    
    // Pattern per sezioni
    const sectionPatterns = {
      title: /^(?!.*:)([A-Za-z\s\-'".,!?]+)$/,
      key: /(?:key|tonalità|chiave)[:]\s*([A-Gb#]+(?:\s*(?:maj|major|min|minor|m|M))?)/i,
      tempo: /(?:tempo|time)[:]\s*([0-9]+\/[0-9]+|[0-9]+)/i,
      intro: /(?:intro|introduzione)[:]\s*([^\n]+)/i,
      verse: /(?:verse|strofa|vers)[:]\s*([^\n]+)/i,
      chorus: /(?:chorus|ritornello|refrain|rit)[:]\s*([^\n]+)/i,
      bridge: /(?:bridge|ponte|middle)[:]\s*([^\n]+)/i,
      outro: /(?:outro|finale|end|coda)[:]\s*([^\n]+)/i
    };
    
    let foundTitle = false;
    
    for (let line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      
      // Cerca titolo (prima riga senza ':' e con lettere)
      if (!foundTitle && sectionPatterns.title.test(trimmed) && trimmed.length > 3 && trimmed.length < 50) {
        map.title = trimmed;
        foundTitle = true;
        continue;
      }
      
      // Cerca altre sezioni
      for (let [section, pattern] of Object.entries(sectionPatterns)) {
        if (section === 'title') continue;
        
        const match = trimmed.match(pattern);
        if (match) {
          map[section] = match[1].trim();
          break;
        }
      }
      
      // Se la riga contiene solo accordi, prova a classificarla
      const chords = trimmed.match(chordPattern);
      if (chords && chords.length >= 2 && trimmed.replace(/[A-Gb#mMajinorsudim+\-0-9/\s]/g, '').length < 3) {
        if (!map.intro && (trimmed.toLowerCase().includes('intro') || lines.indexOf(line) < 3)) {
          map.intro = trimmed;
        } else if (!map.verse && trimmed.toLowerCase().includes('vers')) {
          map.verse = trimmed;
        } else if (!map.chorus && (trimmed.toLowerCase().includes('chor') || trimmed.toLowerCase().includes('rit'))) {
          map.chorus = trimmed;
        } else if (!map.bridge && trimmed.toLowerCase().includes('bridge')) {
          map.bridge = trimmed;
        } else if (!map.outro && (trimmed.toLowerCase().includes('outro') || trimmed.toLowerCase().includes('end'))) {
          map.outro = trimmed;
        }
      }
    }
    
    // Genera struttura se non trovata
    if (!map.structure) {
      const sections = [];
      if (map.intro) sections.push('Intro');
      if (map.verse) sections.push('A × 2');
      if (map.chorus) sections.push('B');
      if (map.verse && map.chorus) sections.push('A → B');
      if (map.bridge) sections.push('Bridge → B');
      if (map.outro) sections.push('Outro');
      
      map.structure = sections.join(' → ') || 'Intro → A × 2 → B → A → B → Outro';
    }
    
    setChordMap(map);
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
