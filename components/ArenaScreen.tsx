import React, { useEffect, useRef, useState } from 'react';
import { AICharacter, DebateConfig, DebateStatus, Message } from '../types';
import { fetchAIResponse } from '../services/api';
import { ChatMessage } from './ChatMessage';
import { getTranslation } from '../translations';
import { FAKE_MODELS, getRandomElement } from '../constants';

interface Props {
  config: DebateConfig;
  onExit: (force?: boolean) => void;
  onNewConfig: (config: DebateConfig) => void;
}

type InterventionType = 'enrage' | 'confuse' | 'chaos' | null;

// Paper plane send icon
const SendIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
);

// Hamburger icon
const MenuIcon = ({ open }: { open: boolean }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    {open ? <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>
     : <><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></>}
  </svg>
);

export const ArenaScreen: React.FC<Props> = ({ config: initialConfig, onExit, onNewConfig }) => {
  const [config, setConfig] = useState(initialConfig);
  const [messages, setMessages] = useState<Message[]>([]);
  const [status, setStatus] = useState<DebateStatus>('running');
  const [currentTurnId, setCurrentTurnId] = useState<'ai1' | 'ai2'>('ai2');
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [userInput, setUserInput] = useState('');
  const [pendingIntervention, setPendingIntervention] = useState<InterventionType>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [modelMenuOpen, setModelMenuOpen] = useState<'none' | 'ai1' | 'ai2'>('none');

  const statusRef = useRef<DebateStatus>('running');
  const timeoutRef = useRef<number | null>(null);
  const messagesRef = useRef<Message[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const modelMenuRef = useRef<HTMLDivElement>(null);

  const t = (key: string) => getTranslation(config.language, key);

  useEffect(() => { statusRef.current = status;
    if (status !== 'running') { window.speechSynthesis.cancel(); setIsSpeaking(false); }
  }, [status]);

  // Initialize
  useEffect(() => {
    setMessages([{ id: 'init', senderId: 'system', senderName: 'Host',
      content: `🎙️ ${t('liveDebate')}: "${config.topic}"\n${t('language')}: ${config.language}`, timestamp: Date.now() }]);
    setStatus('running'); setCurrentTurnId('ai2'); window.speechSynthesis.cancel();
  }, [config.topic, config.language]);

  // Sync messages to ref
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  // Auto scroll
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [messages.length]);

  // Close menus on outside click
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
      if (modelMenuRef.current && !modelMenuRef.current.contains(e.target as Node)) setModelMenuOpen('none');
    };
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h);
  }, []);

  // TTS
  const speakText = (text: string, cid: 'ai1' | 'ai2' | 'system') => {
    if (isMuted || !window.speechSynthesis || cid === 'system') return;
    window.speechSynthesis.cancel();
    const clean = text.replace(/[\u{1F600}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '');
    const u = new SpeechSynthesisUtterance(clean);
    const voices = window.speechSynthesis.getVoices();
    const lc = config.language === 'English' ? 'en' : config.language.startsWith('Turkish') ? 'tr' : 'en';
    let lv = voices.filter(v => v.lang.includes(lc)); if (lv.length === 0) lv = voices;
    let sv = lv[0];
    if (cid === 'ai1') { const m = lv.find(v => v.name.includes('Male') || v.name.includes('David')); if (m) sv = m; u.pitch = 0.9; u.rate = 0.95; }
    else { const f = lv.find(v => v.name.includes('Female') || v.name.includes('Zira')); if (f) sv = f; u.pitch = 1.1; u.rate = 1.05; }
    if (sv) u.voice = sv;
    u.onstart = () => setIsSpeaking(true); u.onend = () => setIsSpeaking(false); u.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.speak(u);
  };

  // Debate loop
  useEffect(() => {
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
    if (status !== 'running') return;

    const processTurn = async () => {
      if (statusRef.current !== 'running') return;
      const speaker = currentTurnId === 'ai1' ? config.ai1 : config.ai2;
      const opponent = currentTurnId === 'ai1' ? config.ai2 : config.ai1;
      const modelName = currentTurnId === 'ai1' ? config.model1 : config.model2;

      const tid = `thinking-${Date.now()}`;
      setMessages(p => [...p, { id: tid, senderId: speaker.id, senderName: speaker.name, content: '...', timestamp: Date.now(), isThinking: true }]);

      let ip: string | null = null;
      if (pendingIntervention) {
        if (pendingIntervention === 'enrage') ip = "MANDATORY: You are FURIOUS. Yell and insult! 🤬";
        else if (pendingIntervention === 'confuse') ip = "MANDATORY: Make up a FALSE scientific fact. Gaslight! 🤥";
        else ip = "MANDATORY: Pivot to aliens/conspiracies! 👽";
        setPendingIntervention(null);
      }
      await new Promise(r => setTimeout(r, 1500));
      if (statusRef.current !== 'running') { setMessages(p => p.filter(m => m.id !== tid)); return; }

      const hist = messagesRef.current.filter(m => !m.isThinking);
      const resp = await fetchAIResponse(speaker, opponent, hist, config.topic, config.language, modelName, ip);
      if (statusRef.current !== 'running') { setMessages(p => p.filter(m => m.id !== tid)); return; }

      setMessages(p => p.map(m => m.id === tid ? { ...m, content: resp, isThinking: false, timestamp: Date.now() } : m));
      speakText(resp, currentTurnId);

      const words = resp.split(' ').length;
      const delay = Math.max(2000, (words / 2.5) * 1000);
      setTimeout(() => { if (statusRef.current === 'running') setCurrentTurnId(p => p === 'ai1' ? 'ai2' : 'ai1'); }, delay);
    };

    const last = messagesRef.current[messagesRef.current.length - 1];
    if (last?.isThinking) return;
    timeoutRef.current = window.setTimeout(() => { if (!window.speechSynthesis.speaking) processTurn(); }, messagesRef.current.length === 1 ? 1000 : 500);

    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
  }, [currentTurnId, status]);

  // Handlers
  const handleInterrupt = () => {
    window.speechSynthesis.cancel(); setIsSpeaking(false);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setMessages(p => p.filter(m => !m.isThinking));
    const ns = currentTurnId === 'ai1' ? 'ai2' : 'ai1';
    setMessages(p => [...p, { id: `sys-${Date.now()}`, senderId: 'system', senderName: 'Director', content: `🛑 Interrupted! ${config[ns].name} takes over!`, timestamp: Date.now() }]);
    setCurrentTurnId(ns);
  };

  const handleIntervention = (type: InterventionType) => {
    setPendingIntervention(type);
    setMessages(p => [...p, { id: `sys-${Date.now()}`, senderId: 'system', senderName: 'Director', content: `⚠️ ${(type || '').toUpperCase()} issued!`, timestamp: Date.now() }]);
  };

  const submitUserMessage = () => {
    const trimmed = userInput.trim(); if (!trimmed) return;
    setMessages(p => [...p, { id: `user-${Date.now()}`, senderId: 'user', senderName: t('userName'), content: trimmed, timestamp: Date.now() }]);
    setUserInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitUserMessage(); }
  };

  const changeModel = (side: 'ai1' | 'ai2', model: string) => {
    setConfig(c => ({ ...c, [side === 'ai1' ? 'model1' : 'model2']: model }));
    setModelMenuOpen('none');
  };

  const handleEnd = () => { setStatus('stopped'); setShowExitConfirm(true); window.speechSynthesis.cancel(); };
  const confirmExit = () => { setShowExitConfirm(false); onExit(true) /* yeni default config ile yeniden başla */ };
  const cancelExit = () => { setShowExitConfirm(false); setStatus('running'); setCurrentTurnId('ai2'); };

  const startNew = () => {
    setMessages([{ id: 'init', senderId: 'system', senderName: 'Host', content: `🎙️ ${t('liveDebate')}: "${config.topic}"\nLanguage: ${config.language}`, timestamp: Date.now() }]);
    setStatus('running'); setCurrentTurnId('ai2'); window.speechSynthesis.cancel();
  };

  // Model seçim dropdown'ı
  const ModelSelect = ({ side, current }: { side: 'ai1' | 'ai2', current: string }) => (
    <div className="relative" ref={modelMenuOpen === side ? modelMenuRef : undefined}>
      <button onClick={() => setModelMenuOpen(modelMenuOpen === side ? 'none' : side)}
        className={`text-[10px] md:text-xs px-2 py-1 rounded border transition-all flex items-center gap-1
          ${side === 'ai1' ? 'text-red-400 border-red-800 hover:border-red-500 bg-red-950/30' : 'text-blue-400 border-blue-800 hover:border-blue-500 bg-blue-950/30'}`}>
        <span className="truncate max-w-[80px] md:max-w-[120px]">{current}</span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="6 9 12 15 18 9" /></svg>
      </button>
      {modelMenuOpen === side && (
        <div className="absolute top-full mt-1 right-0 w-52 max-h-60 overflow-y-auto bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50">
          {FAKE_MODELS.map(m => (
            <button key={m} onClick={() => changeModel(side, m)}
              className={`w-full text-left px-3 py-2 text-xs hover:bg-slate-800 transition-colors ${m === current ? 'text-white font-bold bg-slate-800/50' : 'text-slate-400'}`}>
              {m}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="h-screen w-screen flex flex-col bg-black text-slate-100 overflow-hidden font-sans" style={{ height: '100dvh' }}>

      {/* EXIT MODAL */}
      {showExitConfirm && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 md:p-8 text-center max-w-sm w-full shadow-2xl">
            <h2 className="text-xl font-black text-white mb-2">{t('whoWon') || 'Who Won?'}</h2>
            <p className="text-slate-400 text-sm mb-5">{t('selectWinner') || 'Select the winner'}</p>
            <div className="space-y-3">
              <button onClick={confirmExit} className="w-full p-3 rounded-xl bg-blue-900/40 border border-blue-500/50 text-blue-300 font-bold text-sm hover:bg-blue-800 transition-colors">
                {config.ai2.name} ({config.model2})
              </button>
              <button onClick={confirmExit} className="w-full p-3 rounded-xl bg-red-900/40 border border-red-500/50 text-red-300 font-bold text-sm hover:bg-red-800 transition-colors">
                {config.ai1.name} ({config.model1})
              </button>
              <button onClick={confirmExit} className="w-full p-3 rounded-xl bg-slate-800 border border-slate-600 text-slate-300 font-bold text-sm hover:bg-slate-700 transition-colors">
                {t('draw') || 'Draw'}
              </button>
            </div>
            <button onClick={cancelExit} className="mt-4 text-xs text-slate-500 hover:text-white transition-colors">Cancel — continue debate</button>
          </div>
        </div>
      )}

      {/* HEADER — no dots, clean model names */}
      <div className="flex-shrink-0 h-12 md:h-14 border-b border-slate-800 bg-slate-950/95 flex items-center justify-between px-2 md:px-4 z-30">
        <div className="flex items-center gap-2">
          {/* Hamburger */}
          <div ref={menuRef} className="relative">
            <button onClick={() => setMenuOpen(!menuOpen)} className="p-1.5 text-slate-400 hover:text-white transition-colors">
              <MenuIcon open={menuOpen} />
            </button>
            {menuOpen && (
              <div className="absolute top-full left-0 mt-1 w-56 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 overflow-hidden">
                <div className="p-3 border-b border-slate-800">
                  <h3 className="text-sm font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-red-400">duellm</h3>
                  <p className="text-[10px] text-slate-500">AI vs AI Debate Arena</p>
                </div>
                <div className="p-2 space-y-0.5">
                  <button className="w-full text-left px-3 py-2 text-xs text-slate-300 hover:bg-slate-800 rounded-lg transition-colors">🔐 Sign Up / Login</button>
                  <button onClick={() => { setMenuOpen(false); startNew(); }} className="w-full text-left px-3 py-2 text-xs text-slate-300 hover:bg-slate-800 rounded-lg transition-colors">🔄 New Topic</button>
                  <button onClick={() => { setMenuOpen(false); handleEnd(); }} className="w-full text-left px-3 py-2 text-xs text-red-400 hover:bg-slate-800 rounded-lg transition-colors">⏹ End Debate</button>
                </div>
              </div>
            )}
          </div>

          {/* Title */}
          <div className="hidden sm:flex items-center gap-2">
            <span className="text-xs md:text-sm font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-red-400">duellm</span>
            <span className="text-[10px] text-slate-600 hidden md:inline">|</span>
            <span className="text-[10px] md:text-xs text-slate-400 truncate max-w-[120px] md:max-w-[200px] hidden md:inline">{config.topic}</span>
          </div>
          <span className="text-[10px] text-slate-500 sm:hidden truncate max-w-[100px]">{config.topic}</span>
        </div>

        <div className="flex items-center gap-1.5 md:gap-3">
          {/* Model selectors — clean, no dots */}
          <ModelSelect side="ai2" current={config.model2} />
          <span className="text-slate-600 font-black text-[9px] md:text-[10px] px-0.5">VS</span>
          <ModelSelect side="ai1" current={config.model1} />

          {/* Controls */}
          <button onClick={() => { if (!isMuted) window.speechSynthesis.cancel(); setIsMuted(!isMuted); }}
            className={`px-1.5 md:px-2 py-1 rounded text-[10px] font-bold border transition-all ${isMuted ? 'bg-slate-800 text-slate-500 border-slate-700' : 'bg-blue-900/20 text-blue-300 border-blue-600'}`}>
            {isMuted ? '🔇' : '🔊'}
          </button>

          {status === 'running' ? (
            <button onClick={() => setStatus('paused')} className="px-1.5 md:px-2.5 py-1 rounded text-[10px] font-bold border border-slate-600 bg-slate-800 text-slate-300 hover:bg-slate-700 transition-colors">⏸</button>
          ) : (
            <button onClick={() => setStatus('running')} className="px-1.5 md:px-2.5 py-1 rounded text-[10px] font-bold border border-green-600 bg-green-900/60 text-green-300 animate-pulse transition-colors">▶</button>
          )}

          <button onClick={handleEnd} className="px-1.5 md:px-2.5 py-1 rounded text-[10px] font-bold border border-red-800 bg-red-900/30 text-red-400 hover:bg-red-900/50 transition-colors">⏹</button>
        </div>
      </div>

      {/* ARENA BODY */}
      <div className="flex-1 flex overflow-hidden relative min-h-0">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-black to-black pointer-events-none" />

        {/* CHAT AREA */}
        <div className="flex-1 flex flex-col z-10 max-w-4xl mx-auto w-full min-w-0">

          {/* Mobile AI labels */}
          <div className="flex lg:hidden justify-between px-3 py-1.5 text-[10px] font-bold text-slate-500 bg-slate-950/50 border-b border-slate-800/50 flex-shrink-0">
            <span className={currentTurnId === 'ai2' ? 'text-blue-400' : ''}>{config.ai2.name}</span>
            <span className={currentTurnId === 'ai1' ? 'text-red-400' : ''}>{config.ai1.name}</span>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 md:p-5 space-y-3 md:space-y-4 chat-scroll min-h-0">
            {messages.map(m => <ChatMessage key={m.id} message={m} ai1={config.ai1} ai2={config.ai2} language={config.language} />)}
          </div>

          {/* Director mini bar */}
          <div className="px-3 py-1.5 flex items-center gap-1.5 border-t border-slate-800/50 bg-slate-950/60 flex-shrink-0 overflow-x-auto">
            <span className="text-[9px] text-slate-600 font-bold uppercase tracking-wider hidden sm:inline">Director:</span>
            <button onClick={handleInterrupt} className="px-2 py-1 rounded text-[9px] font-bold border border-red-800 bg-red-900/20 text-red-300 hover:bg-red-900/40 transition-colors flex-shrink-0">🛑 Interrupt</button>
            <button onClick={() => handleIntervention('enrage')}
              className={`px-2 py-1 rounded text-[9px] font-bold border transition-colors flex-shrink-0 ${pendingIntervention === 'enrage' ? 'border-orange-500 bg-orange-600/30 text-orange-300' : 'border-orange-800 bg-orange-900/20 text-orange-400 hover:bg-orange-900/40'}`}>🤬 Enrage</button>
            <button onClick={() => handleIntervention('confuse')}
              className={`px-2 py-1 rounded text-[9px] font-bold border transition-colors flex-shrink-0 ${pendingIntervention === 'confuse' ? 'border-purple-500 bg-purple-600/30 text-purple-300' : 'border-purple-800 bg-purple-900/20 text-purple-400 hover:bg-purple-900/40'}`}>🤥 Confuse</button>
            <button onClick={() => handleIntervention('chaos')}
              className={`px-2 py-1 rounded text-[9px] font-bold border transition-colors flex-shrink-0 ${pendingIntervention === 'chaos' ? 'border-blue-500 bg-blue-600/30 text-blue-300' : 'border-blue-800 bg-blue-900/20 text-blue-400 hover:bg-blue-900/40'}`}>👽 Chaos</button>
          </div>

          {/* USER INPUT — ChatGPT style send icon */}
          <div className="p-2 md:p-3 border-t border-slate-800 bg-black/95 flex-shrink-0">
            <div className="flex items-end gap-2 max-w-3xl mx-auto">
              <textarea
                value={userInput}
                onChange={e => setUserInput(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={1}
                placeholder={t('chatPlaceholder') || 'Type a message...'}
                className="flex-1 resize-none rounded-xl bg-slate-900/80 border border-slate-700 px-3 py-2.5 text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-600/50 text-slate-100"
              />
              <button onClick={submitUserMessage}
                disabled={!userInput.trim()}
                className="flex-shrink-0 w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed hover:bg-blue-500 transition active:scale-95">
                <SendIcon />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
