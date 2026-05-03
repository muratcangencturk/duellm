import React, { useState, useEffect } from 'react';
import { AICharacter, DebateConfig } from '../types';
import { 
  NAMES_LIST, RANDOM_TOPICS, ROLES, TONES, TRAITS_LIST, LANGUAGES, FAKE_MODELS, 
  HISTORICAL_FIGURES, FICTIONAL_FIGURES,
  generateRandomCharacter, getRandomElement 
} from '../constants';
import { getTranslation } from '../translations';

interface Props {
  onStart: (config: DebateConfig) => void;
}

const emptyCharacter = (id: 'ai1' | 'ai2', color: string): AICharacter => ({
  id,
  name: '',
  role: id === 'ai1' ? 'Contra' : 'Pro',
  tone: 'Academic',
  traits: '',
  inspiration: '',
  avatarColor: color
});

// Helper component for expandable chips
const ChipSelector = ({ 
  items, 
  onSelect, 
  label, 
  randomAction, 
  expanded, 
  setExpanded,
  t 
}: { 
  items: string[], 
  onSelect: (val: string) => void, 
  label: string, 
  randomAction: () => void,
  expanded: boolean,
  setExpanded: (val: boolean) => void,
  t: (k: string) => string
}) => {
  const visibleItems = expanded ? items : items.slice(0, 5);

  return (
    <div>
      <div className="flex justify-between items-end mb-1">
          <div className="text-[10px] text-slate-500 font-bold uppercase">{label}</div>
      </div>
      <div className={`flex flex-wrap gap-2 transition-all duration-300 ${expanded ? 'max-h-40 overflow-y-auto pr-1' : ''}`}>
        <button onClick={randomAction} className="text-[10px] uppercase font-bold px-2 py-1 rounded bg-slate-800 border border-slate-700 text-white hover:bg-slate-700 transition-colors" title="Random">🎲</button>
        {visibleItems.map(item => (
            <button key={item} onClick={() => onSelect(item)} className="text-[10px] uppercase font-bold px-2 py-1 rounded bg-slate-800 text-slate-400 hover:bg-slate-700 transition-colors border border-transparent hover:border-slate-600">
                {item}
            </button>
        ))}
        {items.length > 5 && (
            <button onClick={() => setExpanded(!expanded)} className="text-[10px] uppercase font-bold px-2 py-1 rounded bg-slate-900 text-blue-400 hover:text-blue-300 transition-colors">
                {expanded ? t('showLess') : t('showMore')}
            </button>
        )}
      </div>
    </div>
  );
};


export const SetupScreen: React.FC<Props> = ({ onStart }) => {
  const [mode, setMode] = useState<'quick' | 'custom' | 'random'>('quick');
  const [topic, setTopic] = useState('');
  const [language, setLanguage] = useState('English');
  
  // Initialize with random topics correctly so they change every refresh
  const [topicSuggestions, setTopicSuggestions] = useState<string[]>([]);
  const [nameSuggestions1, setNameSuggestions1] = useState<string[]>([]);
  const [nameSuggestions2, setNameSuggestions2] = useState<string[]>([]);
  const [traitsSuggestions, setTraitsSuggestions] = useState<string[]>([]);
  
  // UI States for "Show More" toggles
  const [showMoreTopics, setShowMoreTopics] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});

  const toggleSection = (key: string) => {
    setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }));
  };
  
  // Update random topics on mount
  useEffect(() => {
     shuffleTopics();
     setNameSuggestions1(generateNameSuggestions());
     setNameSuggestions2(generateNameSuggestions());
     // Random traits pool
     setTraitsSuggestions([...TRAITS_LIST].sort(() => 0.5 - Math.random()));
  }, []);

  const t = (key: string) => getTranslation(language, key);
  
  // Model selections (default to Random)
  const [model1, setModel1] = useState('Random');
  const [model2, setModel2] = useState('Random');
  
  // Custom mode state
  const [ai1, setAi1] = useState<AICharacter>(emptyCharacter('ai1', 'bg-red-700'));
  const [ai2, setAi2] = useState<AICharacter>(emptyCharacter('ai2', 'bg-blue-700'));

  // Modal State
  const [activeModal, setActiveModal] = useState<'none' | 'ai1' | 'ai2'>('none');
  const [modalTab, setModalTab] = useState<'history' | 'fiction'>('history');

  const getFinalModel = (selected: string) => {
    if (selected === 'Random') {
      return getRandomElement(FAKE_MODELS);
    }
    return selected;
  };

  const shuffleTopics = () => {
    // Shuffle the array and take 12 for variety
    const shuffled = [...RANDOM_TOPICS].sort(() => 0.5 - Math.random());
    setTopicSuggestions(shuffled.slice(0, 12));
  };

  const generateNameSuggestions = () => {
    const pool = [
        ...NAMES_LIST,
        ...HISTORICAL_FIGURES.map(f => f.name),
        ...FICTIONAL_FIGURES.map(f => f.name)
    ];
    // Fisher-Yates or simple random pick
    const shuffled = [...pool].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, 15);
  };

  const handleInstantStart = () => {
    const tTopic = getRandomElement(RANDOM_TOPICS);
    // Fully random characters (roles included)
    const c1 = generateRandomCharacter('ai1', 'bg-red-700');
    const c2 = generateRandomCharacter('ai2', 'bg-blue-700');
    
    // We DO NOT force Pro/Contra here anymore. 
    // It can be "Jester" vs "Skeptic" or "Judge" vs "Executioner"
    
    onStart({ 
      topic: tTopic, 
      ai1: c1, 
      ai2: c2, 
      language, 
      model1: getFinalModel(model1),
      model2: getFinalModel(model2)
    });
  };

  const handleQuickSetup = () => {
     const tTopic = getRandomElement(RANDOM_TOPICS);
     setTopic(tTopic);
     const c1 = generateRandomCharacter('ai1', 'bg-red-700');
     const c2 = generateRandomCharacter('ai2', 'bg-blue-700');
     // For quick setup default, we stick to classic Pro/Contra but allow user to change
     c1.role = 'Contra';
     c2.role = 'Pro';
     setAi1(c1);
     setAi2(c2);
     setMode('custom'); 
  };

  const handleRandomizeAll = () => {
     handleQuickSetup();
  };

  const randomizeContender = (id: 'ai1' | 'ai2') => {
    const color = id === 'ai1' ? 'bg-red-700' : 'bg-blue-700';
    const newChar = generateRandomCharacter(id, color);
    
    // In custom mode, randomize role too, but user can change it
    if (id === 'ai1') setAi1(newChar);
    else setAi2(newChar);
  };

  const selectPreset = (preset: { name: string, role: string, tone: string, traits: string }) => {
    if (activeModal === 'none') return;
    
    const id = activeModal;
    const color = id === 'ai1' ? 'bg-red-700' : 'bg-blue-700';
    
    const newChar: AICharacter = {
      id,
      name: preset.name,
      role: preset.role,
      tone: preset.tone,
      traits: preset.traits,
      inspiration: 'Preset',
      avatarColor: color
    };

    if (id === 'ai1') setAi1(newChar);
    else setAi2(newChar);
    
    setActiveModal('none');
  };

  const handleCustomStart = () => {
    if (!topic || !ai1.name || !ai2.name) {
      alert("Please fill in the topic and character names.");
      return;
    }
    onStart({ 
      topic, 
      ai1, 
      ai2, 
      language, 
      model1: getFinalModel(model1),
      model2: getFinalModel(model2)
    });
  };

  const updateChar = (id: 'ai1' | 'ai2', field: keyof AICharacter, value: string) => {
    if (id === 'ai1') setAi1({ ...ai1, [field]: value });
    else setAi2({ ...ai2, [field]: value });
  };

  const getRandomName = () => {
     const pool = [...NAMES_LIST, ...HISTORICAL_FIGURES.map(f => f.name), ...FICTIONAL_FIGURES.map(f => f.name)];
     return getRandomElement(pool);
  };

  return (
    <div className="h-screen w-screen flex items-stretch justify-center bg-arena-dark font-sans relative overflow-hidden">
      
      {/* PRESET SELECTION MODAL */}
      {activeModal !== 'none' && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl">
            <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950 rounded-t-xl">
              <h3 className="font-bold text-xl text-white">{t('selectLegend')}</h3>
              <button onClick={() => setActiveModal('none')} className="text-slate-400 hover:text-white text-2xl">&times;</button>
            </div>
            
            <div className="flex border-b border-slate-800">
              <button 
                onClick={() => setModalTab('history')} 
                className={`flex-1 p-3 text-sm font-bold uppercase tracking-wide transition-colors ${modalTab === 'history' ? 'bg-slate-800 text-blue-400' : 'text-slate-500 hover:bg-slate-900'}`}
              >
                {t('historical')}
              </button>
              <button 
                onClick={() => setModalTab('fiction')} 
                className={`flex-1 p-3 text-sm font-bold uppercase tracking-wide transition-colors ${modalTab === 'fiction' ? 'bg-slate-800 text-purple-400' : 'text-slate-500 hover:bg-slate-900'}`}
              >
                {t('fictional')}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 grid grid-cols-1 md:grid-cols-2 gap-3 bg-slate-900">
              {(modalTab === 'history' ? HISTORICAL_FIGURES : FICTIONAL_FIGURES).map((fig, idx) => (
                <button 
                  key={idx} 
                  onClick={() => selectPreset(fig)}
                  className="text-left p-3 rounded border border-slate-700 hover:border-blue-500 hover:bg-slate-800 transition-all group"
                >
                  <div className="font-bold text-slate-200 group-hover:text-white">{fig.name}</div>
                  <div className="text-[10px] text-slate-500 truncate">{fig.role} • {fig.tone}</div>
                </button>
              ))}
            </div>
            
            <div className="p-4 border-t border-slate-800 bg-slate-950 rounded-b-xl text-center">
              <span className="text-xs text-slate-500">{t('applyTraits')}</span>
            </div>
          </div>
        </div>
      )}

      <div className="w-full h-full bg-slate-900 border-0 rounded-none shadow-2xl overflow-hidden flex flex-col md:flex-row">
        
        {/* Sidebar / Settings */}
        <div className="w-full md:w-1/4 bg-slate-950 p-6 flex flex-col gap-4 border-r border-slate-800 overflow-y-auto">
          <h1 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-500 to-red-500 mb-2 tracking-tighter">
            {t('appTitle')}
          </h1>
          <p className="text-xs text-slate-500 mb-6 font-mono">{t('appSubtitle')}</p>
          
          <button 
            onClick={handleQuickSetup}
            className={`p-4 text-left rounded-xl transition-all border ${mode === 'quick' || mode === 'custom' ? 'bg-slate-800 border-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.2)]' : 'border-slate-800 hover:bg-slate-900'}`}
          >
            <div className="font-bold text-lg text-white">{t('quickMatch')}</div>
            <div className="text-xs text-slate-400">{t('quickDesc')}</div>
          </button>
          
          <button 
            onClick={handleInstantStart}
            className="p-4 text-left rounded-xl transition-all border border-slate-800 hover:bg-red-900/10 hover:border-red-500 group"
          >
            <div className="font-bold text-lg text-white group-hover:text-red-400 transition-colors">{t('instantMatch')}</div>
            <div className="text-xs text-slate-400">{t('instantDesc')}</div>
          </button>

          <div className="my-4 border-t border-slate-800 pt-4 space-y-4">
            <div>
              <label className="text-xs uppercase text-slate-500 font-bold mb-1 block">{t('language')}</label>
              <select 
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-2 text-xs text-slate-300 focus:border-blue-500 outline-none"
              >
                {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs uppercase text-red-400 font-bold mb-1 block">{t('contender1Engine')}</label>
                <select 
                  value={model1}
                  onChange={(e) => setModel1(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-2 text-xs text-red-300 font-mono focus:border-red-500 outline-none"
                >
                  <option value="Random">🎲 Random Model</option>
                  {FAKE_MODELS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>

              <div>
                <label className="text-xs uppercase text-blue-400 font-bold mb-1 block">{t('contender2Engine')}</label>
                <select 
                  value={model2}
                  onChange={(e) => setModel2(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-2 text-xs text-blue-300 font-mono focus:border-blue-500 outline-none"
                >
                  <option value="Random">🎲 Random Model</option>
                  {FAKE_MODELS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 p-6 md:p-10 overflow-y-auto bg-gradient-to-br from-slate-900 to-slate-950 relative">
          {/* Background Grid */}
          <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 pointer-events-none"></div>
          
          {mode === 'quick' && (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-8 relative z-10">
              <div className="w-24 h-24 bg-blue-600/20 rounded-full flex items-center justify-center animate-pulse-slow ring-4 ring-blue-500/20">
                <span className="text-6xl">⚔️</span>
              </div>
              <div>
                <h2 className="text-4xl font-black text-white mb-2">{t('readyToBrawl')}</h2>
                <p className="text-slate-400 max-w-lg mx-auto text-lg">
                  {t('brawlDesc')}
                </p>
              </div>
              <button 
                onClick={handleQuickSetup}
                className="px-10 py-4 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-black rounded-xl shadow-[0_0_40px_rgba(37,99,235,0.4)] transition-all transform hover:scale-105 border border-white/10"
              >
                {t('initiateDebate')}
              </button>
            </div>
          )}

          {mode === 'custom' && (
            <div className="space-y-8 animate-fadeIn relative z-10">
              {/* Topic */}
              <div className="bg-slate-800/40 p-6 rounded-xl border border-slate-700 backdrop-blur-sm">
                <div className="flex justify-between items-center mb-2">
                   <label className="block text-sm font-bold text-blue-400 tracking-widest">{t('topicConflict')}</label>
                   <div className="flex gap-4">
                     <button onClick={shuffleTopics} className="text-xs text-slate-400 hover:text-white flex items-center gap-1 transition-colors">
                        {t('refresh')}
                     </button>
                     <button onClick={handleRandomizeAll} className="text-xs text-slate-400 hover:text-white flex items-center gap-1 transition-colors">
                        {t('randomizeAll')}
                     </button>
                   </div>
                </div>
                <input 
                  type="text" 
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="e.g. Is Mars colonization viable?"
                  className="w-full bg-slate-900/80 border border-slate-600 rounded-lg p-4 text-white focus:ring-2 focus:ring-blue-500 outline-none text-xl font-medium placeholder-slate-600"
                />
                <div className={`flex flex-wrap gap-2 mt-3 transition-all duration-300 ${showMoreTopics ? 'max-h-48 overflow-y-auto' : ''}`}>
                  {(showMoreTopics ? topicSuggestions : topicSuggestions.slice(0, 4)).map(t => (
                    <button key={t} onClick={() => setTopic(t)} className="text-xs bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-full text-slate-300 border border-slate-600 transition-colors text-left">
                      {t.length > 50 ? t.substring(0, 50) + '...' : t}
                    </button>
                  ))}
                  <button onClick={() => setShowMoreTopics(!showMoreTopics)} className="text-xs text-blue-400 px-3 py-1.5 font-bold">
                    {showMoreTopics ? t('showLess') : t('showMore')}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* AI 1 Config */}
                <div className="bg-gradient-to-b from-red-950/30 to-slate-900/50 p-6 rounded-xl border border-red-900/30 backdrop-blur-sm">
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="text-red-500 font-black flex items-center gap-2 text-xl">
                      <div className="w-3 h-3 bg-red-600 rounded-sm rotate-45"></div> 
                      {t('contender1')}
                    </h3>
                    <div className="flex gap-2">
                       <button onClick={() => setActiveModal('ai1')} className="text-[10px] bg-slate-800 hover:bg-slate-700 px-2 py-1 rounded border border-slate-700 text-white transition-colors">{t('presets')}</button>
                       <button onClick={() => randomizeContender('ai1')} className="text-[10px] bg-red-900/50 hover:bg-red-800 px-2 py-1 rounded border border-red-800 text-white transition-colors">{t('randomize')}</button>
                    </div>
                  </div>
                  
                  <div className="space-y-4">
                    {/* NAME */}
                    <input 
                        placeholder={t('namePlaceholder')} 
                        value={ai1.name} 
                        onChange={(e) => updateChar('ai1', 'name', e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded p-3 text-sm focus:border-red-500 outline-none mb-2" 
                    />
                    <ChipSelector 
                        label={t('nameLabel')}
                        items={nameSuggestions1}
                        onSelect={(val) => updateChar('ai1', 'name', val)}
                        randomAction={() => updateChar('ai1', 'name', getRandomName())}
                        expanded={!!expandedSections['ai1_name']}
                        setExpanded={() => toggleSection('ai1_name')}
                        t={t}
                    />

                    {/* ROLE */}
                    <input
                        placeholder={t('rolePlaceholder')}
                        value={ai1.role} 
                        onChange={(e) => updateChar('ai1', 'role', e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded p-3 text-sm outline-none placeholder-slate-500 mb-2"
                    />
                    <ChipSelector 
                        label={t('roleLabel')}
                        items={ROLES}
                        onSelect={(val) => updateChar('ai1', 'role', val)}
                        randomAction={() => updateChar('ai1', 'role', getRandomElement(ROLES))}
                        expanded={!!expandedSections['ai1_role']}
                        setExpanded={() => toggleSection('ai1_role')}
                        t={t}
                    />

                    {/* TONE */}
                    <input
                        placeholder={t('tonePlaceholder')} 
                        value={ai1.tone} 
                        onChange={(e) => updateChar('ai1', 'tone', e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded p-3 text-sm outline-none placeholder-slate-500 mb-2"
                    />
                    <ChipSelector 
                        label={t('toneLabel')}
                        items={TONES}
                        onSelect={(val) => updateChar('ai1', 'tone', val)}
                        randomAction={() => updateChar('ai1', 'tone', getRandomElement(TONES))}
                        expanded={!!expandedSections['ai1_tone']}
                        setExpanded={() => toggleSection('ai1_tone')}
                        t={t}
                    />

                    {/* TRAITS */}
                    <textarea 
                      placeholder={t('traitsPlaceholder')} 
                      value={ai1.traits} 
                      onChange={(e) => updateChar('ai1', 'traits', e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded p-3 text-sm h-16 resize-none focus:border-red-500 outline-none mb-2"
                    />
                    <ChipSelector 
                        label="TRAITS"
                        items={traitsSuggestions}
                        onSelect={(val) => updateChar('ai1', 'traits', val)}
                        randomAction={() => updateChar('ai1', 'traits', getRandomElement(TRAITS_LIST))}
                        expanded={!!expandedSections['ai1_traits']}
                        setExpanded={() => toggleSection('ai1_traits')}
                        t={t}
                    />
                  </div>
                </div>

                {/* AI 2 Config */}
                <div className="bg-gradient-to-b from-blue-950/30 to-slate-900/50 p-6 rounded-xl border border-blue-900/30 backdrop-blur-sm">
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="text-blue-500 font-black flex items-center gap-2 text-xl">
                      <div className="w-3 h-3 bg-blue-600 rounded-sm rotate-45"></div> 
                      {t('contender2')}
                    </h3>
                    <div className="flex gap-2">
                       <button onClick={() => setActiveModal('ai2')} className="text-[10px] bg-slate-800 hover:bg-slate-700 px-2 py-1 rounded border border-slate-700 text-white transition-colors">{t('presets')}</button>
                       <button onClick={() => randomizeContender('ai2')} className="text-[10px] bg-blue-900/50 hover:bg-blue-800 px-2 py-1 rounded border border-blue-800 text-white transition-colors">{t('randomize')}</button>
                    </div>
                  </div>
                  <div className="space-y-4">
                    {/* NAME */}
                    <input 
                        placeholder={t('namePlaceholder')} 
                        value={ai2.name} 
                        onChange={(e) => updateChar('ai2', 'name', e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded p-3 text-sm focus:border-blue-500 outline-none mb-2" 
                    />
                     <ChipSelector 
                        label={t('nameLabel')}
                        items={nameSuggestions2}
                        onSelect={(val) => updateChar('ai2', 'name', val)}
                        randomAction={() => updateChar('ai2', 'name', getRandomName())}
                        expanded={!!expandedSections['ai2_name']}
                        setExpanded={() => toggleSection('ai2_name')}
                        t={t}
                    />
                     
                    {/* ROLE */}
                    <input 
                        placeholder={t('rolePlaceholder')}
                        value={ai2.role} 
                        onChange={(e) => updateChar('ai2', 'role', e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded p-3 text-sm outline-none placeholder-slate-500 mb-2"
                    />
                    <ChipSelector 
                        label={t('roleLabel')}
                        items={ROLES}
                        onSelect={(val) => updateChar('ai2', 'role', val)}
                        randomAction={() => updateChar('ai2', 'role', getRandomElement(ROLES))}
                        expanded={!!expandedSections['ai2_role']}
                        setExpanded={() => toggleSection('ai2_role')}
                        t={t}
                    />

                    {/* TONE */}
                    <input
                        placeholder={t('tonePlaceholder')}
                        value={ai2.tone} 
                        onChange={(e) => updateChar('ai2', 'tone', e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded p-3 text-sm outline-none placeholder-slate-500 mb-2"
                    />
                    <ChipSelector 
                        label={t('toneLabel')}
                        items={TONES}
                        onSelect={(val) => updateChar('ai2', 'tone', val)}
                        randomAction={() => updateChar('ai2', 'tone', getRandomElement(TONES))}
                        expanded={!!expandedSections['ai2_tone']}
                        setExpanded={() => toggleSection('ai2_tone')}
                        t={t}
                    />

                    {/* TRAITS */}
                    <textarea 
                      placeholder={t('traitsPlaceholder')} 
                      value={ai2.traits} 
                      onChange={(e) => updateChar('ai2', 'traits', e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded p-3 text-sm h-16 resize-none focus:border-blue-500 outline-none mb-2"
                    />
                    <ChipSelector 
                        label="TRAITS"
                        items={traitsSuggestions}
                        onSelect={(val) => updateChar('ai2', 'traits', val)}
                        randomAction={() => updateChar('ai2', 'traits', getRandomElement(TRAITS_LIST))}
                        expanded={!!expandedSections['ai2_traits']}
                        setExpanded={() => toggleSection('ai2_traits')}
                        t={t}
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-center pt-4 pb-10">
                <button 
                  onClick={handleCustomStart}
                  className="w-full md:w-2/3 px-8 py-4 bg-white text-slate-900 font-black rounded-lg shadow-[0_0_30px_rgba(255,255,255,0.2)] text-xl hover:bg-slate-200 transition-all transform hover:-translate-y-1"
                >
                  {t('startBattle')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
