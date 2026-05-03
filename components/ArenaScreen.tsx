import React, { useEffect, useRef, useState } from 'react';
import { AICharacter, DebateConfig, DebateStatus, Message } from '../types';
import { fetchAIResponse } from '../services/api';
import { ChatMessage } from './ChatMessage';
import { CharacterCard } from './CharacterCard';
import { getTranslation } from '../translations';

interface Props {
  config: DebateConfig;
  onExit: (force?: boolean) => void;
}

type InterventionType = 'enrage' | 'confuse' | 'chaos' | null;
type ActiveIntervention = Exclude<InterventionType, null>;

interface DirectorMiniControlsProps {
  pendingIntervention: InterventionType;
  onInterrupt: () => void;
  onIntervention: (type: ActiveIntervention) => void;
  t: (key: string) => string;
  className?: string;
}

// Paper plane / send icon SVG
const SendIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13"></line>
    <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
  </svg>
);

const DirectorMiniControls: React.FC<DirectorMiniControlsProps> = ({
  pendingIntervention,
  onInterrupt,
  onIntervention,
  t,
  className,
}) => (
  <div className={`grid grid-cols-4 gap-2 ${className ?? ''}`}>
    <button
      type="button"
      onClick={onInterrupt}
      aria-pressed={false}
      className="flex flex-col items-center justify-center p-2 rounded-lg bg-red-900/20 border border-red-800 hover:bg-red-900/40 hover:border-red-500 transition-all active:scale-95"
    >
      <span className="text-[9px] font-semibold text-red-300 text-center leading-tight">{t('btnInterrupt')}</span>
    </button>

    <button
      type="button"
      onClick={() => onIntervention('enrage')}
      aria-pressed={pendingIntervention === 'enrage'}
      className={`flex flex-col items-center justify-center p-2 rounded-lg border transition-all active:scale-95
        ${pendingIntervention === 'enrage' ? 'bg-orange-600/40 border-orange-500' : 'bg-orange-900/20 border-orange-800 hover:bg-orange-900/40 hover:border-orange-500'}
      `}
    >
      <span className="text-[9px] font-semibold text-orange-300 text-center leading-tight">{t('btnEnrage')}</span>
    </button>

    <button
      type="button"
      onClick={() => onIntervention('confuse')}
      aria-pressed={pendingIntervention === 'confuse'}
      className={`flex flex-col items-center justify-center p-2 rounded-lg border transition-all active:scale-95
        ${pendingIntervention === 'confuse' ? 'bg-purple-600/40 border-purple-500' : 'bg-purple-900/20 border-purple-800 hover:bg-purple-900/40 hover:border-purple-500'}
      `}
    >
      <span className="text-[9px] font-semibold text-purple-300 text-center leading-tight">{t('btnConfuse')}</span>
    </button>

    <button
      type="button"
      onClick={() => onIntervention('chaos')}
      aria-pressed={pendingIntervention === 'chaos'}
      className={`flex flex-col items-center justify-center p-2 rounded-lg border transition-all active:scale-95
        ${pendingIntervention === 'chaos' ? 'bg-blue-600/40 border-blue-500' : 'bg-blue-900/20 border-blue-800 hover:bg-blue-900/40 hover:border-blue-500'}
      `}
    >
      <span className="text-[9px] font-semibold text-blue-300 text-center leading-tight">{t('btnChaos')}</span>
    </button>
  </div>
);

export const ArenaScreen: React.FC<Props> = ({ config, onExit }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [status, setStatus] = useState<DebateStatus>('running');
  const [currentTurnId, setCurrentTurnId] = useState<'ai1' | 'ai2'>('ai2');
  const [showWinnerSelection, setShowWinnerSelection] = useState(false);
  const [userInput, setUserInput] = useState('');
  const [pendingIntervention, setPendingIntervention] = useState<InterventionType>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const statusRef = useRef<DebateStatus>('running');

  useEffect(() => {
    statusRef.current = status;
    if (status !== 'running') {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }
  }, [status]);

  const t = (key: string) => getTranslation(config.language, key);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<number | null>(null);
  const messagesRef = useRef<Message[]>([]);

  useEffect(() => {
    setMessages([{
      id: 'init',
      senderId: 'system',
      senderName: 'Host',
      content: `🎙️ ${t('liveDebate')}: "${config.topic}"\n${t('language')}: ${config.language}`,
      timestamp: Date.now()
    }]);
    setStatus('running');
    setCurrentTurnId('ai2');
    window.speechSynthesis.cancel();
  }, [config.topic, config.language]);

  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [messages.length]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const speakText = (text: string, characterId: 'ai1' | 'ai2' | 'system') => {
    if (isMuted || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    if (characterId === 'system') return;

    const textForSpeech = text.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '');

    const utterance = new SpeechSynthesisUtterance(textForSpeech);
    const voices = window.speechSynthesis.getVoices();

    const langCode = config.language === 'English' ? 'en' :
      config.language.startsWith('Spanish') ? 'es' :
        config.language.startsWith('German') ? 'de' :
          config.language.startsWith('French') ? 'fr' :
            config.language.startsWith('Chinese') ? 'zh' :
              config.language.startsWith('Japanese') ? 'ja' :
                config.language.startsWith('Russian') ? 'ru' : 'en';

    let langVoices = voices.filter(v => v.lang.includes(langCode));
    if (langVoices.length === 0) langVoices = voices;

    let selectedVoice = langVoices[0];

    if (characterId === 'ai1') {
      const maleVoice = langVoices.find(v => v.name.includes('Male') || v.name.includes('David') || v.name.includes('Google US English'));
      if (maleVoice) selectedVoice = maleVoice;
      utterance.pitch = 0.9;
      utterance.rate = 0.95;
    } else {
      const femaleVoice = langVoices.find(v => v.name.includes('Female') || v.name.includes('Zira') || v.name.includes('Google UK English Female'));
      if (femaleVoice) selectedVoice = femaleVoice;
      utterance.pitch = 1.1;
      utterance.rate = 1.05;
    }

    if (selectedVoice) utterance.voice = selectedVoice;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    window.speechSynthesis.speak(utterance);
  };

  useEffect(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    if (status !== 'running' || showWinnerSelection) return;

    const processTurn = async () => {
      if (statusRef.current !== 'running') return;

      const speaker = currentTurnId === 'ai1' ? config.ai1 : config.ai2;
      const opponent = currentTurnId === 'ai1' ? config.ai2 : config.ai1;
      const currentModelName = currentTurnId === 'ai1' ? config.model1 : config.model2;

      const tempId = `thinking-${Date.now()}`;
      setMessages(prev => [...prev, {
        id: tempId,
        senderId: speaker.id,
        senderName: speaker.name,
        content: '...',
        timestamp: Date.now(),
        isThinking: true
      }]);

      let interventionPrompt: string | null = null;
      if (pendingIntervention) {
        if (pendingIntervention === 'enrage') interventionPrompt = "MANDATORY: You are now FURIOUS. Yell, insult the opponent, and be aggressive! 🤬";
        if (pendingIntervention === 'confuse') interventionPrompt = "MANDATORY: Make up a completely detailed but OBVIOUSLY FALSE scientific fact to support your argument. Gaslight the opponent. 🤥";
        if (pendingIntervention === 'chaos') interventionPrompt = "MANDATORY: Ignore the previous topic entirely. Pivot to talking about Aliens or Conspiracy Theories immediately! 👽";
        setPendingIntervention(null);
      }

      await new Promise(r => setTimeout(r, 1500));

      if (statusRef.current !== 'running') {
        setMessages(prev => prev.filter(m => m.id !== tempId));
        return;
      }

      const validHistory = messagesRef.current.filter(m => !m.isThinking);
      const responseText = await fetchAIResponse(
        speaker, opponent, validHistory, config.topic, config.language, currentModelName, interventionPrompt
      );

      if (statusRef.current !== 'running') {
        setMessages(prev => prev.filter(m => m.id !== tempId));
        return;
      }

      setMessages(prev => prev.map(m =>
        m.id === tempId
          ? { ...m, content: responseText, isThinking: false, timestamp: Date.now() }
          : m
      ));

      speakText(responseText, currentTurnId);

      const words = responseText.split(' ').length;
      const readTimeMs = Math.max(2000, (words / 2.5) * 1000);

      setTimeout(() => {
        if (statusRef.current === 'running') {
          setCurrentTurnId(prev => prev === 'ai1' ? 'ai2' : 'ai1');
        }
      }, readTimeMs);
    };

    const lastMsg = messagesRef.current[messagesRef.current.length - 1];
    if (lastMsg?.isThinking) return;

    if (messagesRef.current.length === 1) {
      timeoutRef.current = window.setTimeout(() => {
        processTurn();
      }, 1000);
    } else {
      timeoutRef.current = window.setTimeout(() => {
        if (!window.speechSynthesis.speaking) {
          processTurn();
        }
      }, 1000);
    }

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };

  }, [currentTurnId, status, showWinnerSelection]);

  const handleInterrupt = () => {
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setMessages(prev => prev.filter(m => !m.isThinking));

    const nextSpeaker = currentTurnId === 'ai1' ? 'ai2' : 'ai1';

    setMessages(prev => [...prev, {
      id: `sys-${Date.now()}`,
      senderId: 'system',
      senderName: 'Director',
      content: `🛑 ${t('btnInterrupt')}! ${config[nextSpeaker].name} takes the floor!`,
      timestamp: Date.now()
    }]);

    setCurrentTurnId(nextSpeaker);

    setTimeout(() => {}, 500);
  };

  const handleIntervention = (type: InterventionType) => {
    setPendingIntervention(type);

    const label = type === 'enrage' ? t('btnEnrage') : type === 'confuse' ? t('btnConfuse') : t('btnChaos');
    setMessages(prev => [...prev, {
      id: `sys-${Date.now()}`,
      senderId: 'system',
      senderName: 'Director',
      content: `⚠️ COMMAND ISSUED: ${label}`,
      timestamp: Date.now()
    }]);
  };

  const handleEndShow = () => {
    setStatus('stopped');
    setShowWinnerSelection(true);
    window.speechSynthesis.cancel();
  };

  const handleWinnerSelection = (_winner: 'ai1' | 'ai2' | 'draw') => {
    onExit(true);
  };

  const submitUserMessage = () => {
    const trimmed = userInput.trim();
    if (!trimmed) return;

    setMessages(prev => [
      ...prev,
      {
        id: `user-${Date.now()}`,
        senderId: 'user',
        senderName: t('userName'),
        content: trimmed,
        timestamp: Date.now()
      }
    ]);
    setUserInput('');
  };

  const handleUserSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submitUserMessage();
  };

  const handleUserKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submitUserMessage();
    }
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-black text-slate-100 overflow-hidden relative font-sans">

      {/* WINNER SELECTION MODAL */}
      {showWinnerSelection && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg p-8 shadow-2xl text-center">
            <h2 className="text-3xl font-black text-white mb-2 tracking-tighter">{t('whoWon')}</h2>
            <p className="text-slate-400 mb-8">{t('selectWinner')}</p>

            <div className="space-y-4">
              <button
                onClick={() => handleWinnerSelection('ai2')}
                className="w-full p-4 rounded-xl bg-blue-900/40 border border-blue-600/50 hover:bg-blue-800 hover:border-blue-500 transition-all flex items-center justify-between group"
              >
                <span className="font-bold text-blue-300 group-hover:text-white">
                  {config.ai2.name} <span className="text-blue-400/80">({config.model2})</span>
                </span>
                <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center text-xs">VS</div>
              </button>

              <button
                onClick={() => handleWinnerSelection('ai1')}
                className="w-full p-4 rounded-xl bg-red-900/40 border border-red-600/50 hover:bg-red-800 hover:border-red-500 transition-all flex items-center justify-between group"
              >
                <span className="font-bold text-red-300 group-hover:text-white">
                  {config.ai1.name} <span className="text-red-400/80">({config.model1})</span>
                </span>
                <div className="w-6 h-6 rounded-full bg-red-500 flex items-center justify-center text-xs">VS</div>
              </button>

              <button
                onClick={() => handleWinnerSelection('draw')}
                className="w-full p-4 rounded-xl bg-slate-800 border border-slate-600 hover:bg-slate-700 transition-all flex items-center justify-center"
              >
                <span className="font-bold text-slate-300">{t('draw')}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header — noktalar kaldırıldı, sadece isim uygun renkte */}
      <div className="flex-shrink-0 h-14 md:h-16 border-b border-slate-800 bg-slate-900/90 flex items-center justify-between px-3 md:px-6 z-20 shadow-xl">
        <div className="flex flex-col min-w-0">
          <div className="font-black text-sm md:text-lg tracking-tight text-white flex items-center gap-2">
            <span className="text-red-500 animate-pulse hidden xs:inline">⚡</span> {t('liveDebate')}
            <span className="text-slate-500 text-[10px] md:text-xs font-normal border border-slate-700 rounded px-1.5 md:px-2 py-0.5 ml-1">
              {config.language}
            </span>
          </div>
          <div className="text-[10px] md:text-xs text-slate-400 truncate max-w-[150px] md:max-w-md">
            {config.topic}
          </div>
        </div>

        {/* Model isimleri — noktalar kaldırıldı, sadece renkli isim */}
        <div className="hidden sm:flex items-center gap-2 md:gap-4">
          <span className="text-xs md:text-sm font-mono font-semibold text-blue-400">{config.model2}</span>
          <div className="text-slate-600 font-black text-[10px] md:text-xs">VS</div>
          <span className="text-xs md:text-sm font-mono font-semibold text-red-400">{config.model1}</span>
        </div>

        <div className="flex gap-1.5 md:gap-4 items-center">
          <button
            onClick={() => {
              if (!isMuted) window.speechSynthesis.cancel();
              setIsMuted(!isMuted);
            }}
            className={`px-2 md:px-3 py-1 md:py-1.5 rounded-full text-[9px] md:text-[10px] font-bold uppercase transition-all border ${isMuted ? 'bg-slate-800 text-slate-400 border-slate-600' : 'bg-blue-900/30 text-blue-300 border-blue-500'}`}
          >
            {isMuted ? '🔇' : '🔊'}
          </button>

          <button
            onClick={() => setStatus(prev => prev === 'running' ? 'paused' : 'running')}
            className={`cursor-pointer px-2 md:px-4 py-1 md:py-1.5 rounded-full text-[9px] md:text-xs font-bold uppercase tracking-widest transition-all text-center
            ${status === 'running' ? 'bg-slate-800 hover:bg-slate-700 text-white border border-slate-600' : ''}
            ${status === 'paused' ? 'bg-green-900/80 hover:bg-green-800 text-green-300 border border-green-600 animate-pulse' : ''}
          `}>
            {status === 'running' ? t('pause') : t('resume')}
          </button>

          <button onClick={handleEndShow} className="bg-red-900/30 hover:bg-red-900/60 text-red-400 hover:text-red-200 px-2 md:px-4 py-1 md:py-1.5 rounded transition-colors font-bold text-[9px] md:text-xs border border-red-900/50">
            {t('endShow')}
          </button>
        </div>
      </div>

      {/* Main Arena */}
      <div className="flex-1 flex overflow-hidden relative min-h-0">

        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-black to-black pointer-events-none"></div>

        {/* AI 2 Panel (Blue/Left) — desktop only */}
        <div className="hidden lg:flex w-1/4 p-4 md:p-6 items-center justify-center z-10 flex-shrink-0">
          <div className="flex flex-col items-center gap-2 md:gap-3 w-full">
            <CharacterCard
              character={config.ai2}
              isActive={currentTurnId === 'ai2' && (status === 'running' || isSpeaking)}
              align="left"
              language={config.language}
              modelName={config.model2}
            />
            <DirectorMiniControls
              pendingIntervention={pendingIntervention}
              onInterrupt={handleInterrupt}
              onIntervention={handleIntervention}
              t={t}
              className="w-full"
            />
          </div>
        </div>

        {/* Chat Area */}
        <div className="flex-1 flex flex-col z-0 relative w-full bg-slate-950/30 border-x border-white/5 backdrop-blur-sm min-w-0">

          {/* Mobile AI headers */}
          <div className="flex lg:hidden justify-between px-3 py-2 text-[11px] font-bold text-slate-400 bg-slate-900 border-b border-slate-800 z-20 flex-shrink-0">
            <span className={`${currentTurnId === 'ai2' ? 'text-blue-400' : ''} transition-all`}>{config.ai2.name}</span>
            <span className={`${currentTurnId === 'ai1' ? 'text-red-400' : ''} transition-all`}>{config.ai1.name}</span>
          </div>

          {/* Messages */}
          <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-3 md:p-6 chat-scroll space-y-4 md:space-y-6 min-h-0">
            {messages.map((msg) => (
              <ChatMessage key={msg.id} message={msg} ai1={config.ai1} ai2={config.ai2} language={config.language} />
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Mobile Director */}
          <div className="lg:hidden px-3 pb-2 flex-shrink-0">
            <div className="flex items-center justify-between mb-1">
              <h4 className="text-[9px] font-black tracking-widest text-slate-500 uppercase">{t('directorMode')}</h4>
              {pendingIntervention && <span className="text-[9px] text-yellow-500 font-bold animate-pulse truncate ml-2">PENDING</span>}
            </div>
            <DirectorMiniControls
              pendingIntervention={pendingIntervention}
              onInterrupt={handleInterrupt}
              onIntervention={handleIntervention}
              t={t}
            />
          </div>

          {/* User Input — ChatGPT tarzı mesaj gönderme ikonu */}
          <div className="p-3 md:p-4 border-t border-slate-800 bg-black/90 backdrop-blur z-20 flex-shrink-0">
            <form onSubmit={handleUserSubmit} className="flex items-end gap-2 md:gap-3 max-w-4xl mx-auto">
              <textarea
                id="user-message"
                value={userInput}
                onChange={(event) => setUserInput(event.target.value)}
                onKeyDown={handleUserKeyDown}
                rows={1}
                placeholder={t('chatPlaceholder')}
                className="flex-1 resize-none rounded-xl bg-slate-900/80 border border-slate-700 px-3 md:px-4 py-2.5 md:py-3 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-600/60"
              />
              <button
                type="submit"
                disabled={!userInput.trim()}
                className="flex-shrink-0 w-10 h-10 md:w-11 md:h-11 rounded-xl bg-blue-600 text-white flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed hover:bg-blue-500 transition active:scale-95"
                aria-label={t('sendMessage')}
              >
                <SendIcon />
              </button>
            </form>
          </div>
        </div>

        {/* AI 1 Panel (Red/Right) — desktop only */}
        <div className="hidden lg:flex w-1/4 p-4 md:p-6 items-center justify-center z-10 flex-shrink-0">
          <div className="flex flex-col items-center gap-2 md:gap-3 w-full">
            <CharacterCard
              character={config.ai1}
              isActive={currentTurnId === 'ai1' && (status === 'running' || isSpeaking)}
              align="right"
              language={config.language}
              modelName={config.model1}
            />
            <DirectorMiniControls
              pendingIntervention={pendingIntervention}
              onInterrupt={handleInterrupt}
              onIntervention={handleIntervention}
              t={t}
              className="w-full"
            />
          </div>
        </div>

      </div>
    </div>
  );
};
