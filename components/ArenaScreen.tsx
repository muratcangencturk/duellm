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
  // START TURN WITH AI2 (Blue) as requested
  const [currentTurnId, setCurrentTurnId] = useState<'ai1' | 'ai2'>('ai2');
  const [showWinnerSelection, setShowWinnerSelection] = useState(false);
  const [userInput, setUserInput] = useState('');
  
  // Director Mode State
  const [pendingIntervention, setPendingIntervention] = useState<InterventionType>(null);
  
  // Audio state
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false); // Used to animate cards
  
  // Use a ref to track status inside async timeouts/callbacks to ensure we always have the latest value
  const statusRef = useRef<DebateStatus>('running');

  // Sync ref with state
  useEffect(() => {
    statusRef.current = status;
    // Stop speaking if paused/stopped
    if (status !== 'running') {
        window.speechSynthesis.cancel();
        setIsSpeaking(false);
    }
  }, [status]);
  
  const t = (key: string) => getTranslation(config.language, key);

  // Refs for auto-scroll and loop management
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<number | null>(null);
  const messagesRef = useRef<Message[]>([]);

  // Initialize
  useEffect(() => {
    // Add system start message
    setMessages([{
      id: 'init',
      senderId: 'system',
      senderName: 'Host',
      content: `🎙️ ${t('liveDebate')}: "${config.topic}"\n${t('language')}: ${config.language}`,
      timestamp: Date.now()
    }]);
    
    // Start loop
    setStatus('running');
    setCurrentTurnId('ai2'); // AI 2 (Blue) starts

    // Initialize TTS
    window.speechSynthesis.cancel(); // Reset
  }, [config.topic, config.language]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [messages.length]); 

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // --- TTS LOGIC ---
  const speakText = (text: string, characterId: 'ai1' | 'ai2' | 'system') => {
    if (isMuted || !window.speechSynthesis) return;

    // Stop previous
    window.speechSynthesis.cancel();

    if (characterId === 'system') return; // Don't read system messages

    // STRIP EMOJIS FOR AUDIO
    // Removes typical emoji ranges so they aren't read as "Fire Emoji" or "Clown Face"
    const textForSpeech = text.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '');

    const utterance = new SpeechSynthesisUtterance(textForSpeech);
    const voices = window.speechSynthesis.getVoices();

    // VOICE SELECTION STRATEGY:
    // AI 1 (Red/Contra): Deeper, slightly slower (Male preference)
    // AI 2 (Blue/Pro): Higher, slightly faster (Female preference)
    
    // Filter by language first
    const langCode = config.language === 'English' ? 'en' : 
                     config.language.startsWith('Spanish') ? 'es' : 
                     config.language.startsWith('German') ? 'de' :
                     config.language.startsWith('French') ? 'fr' :
                     config.language.startsWith('Chinese') ? 'zh' :
                     config.language.startsWith('Japanese') ? 'ja' :
                     config.language.startsWith('Russian') ? 'ru' : 'en';

    let langVoices = voices.filter(v => v.lang.includes(langCode));
    if (langVoices.length === 0) langVoices = voices; // Fallback to all

    let selectedVoice = langVoices[0];

    if (characterId === 'ai1') {
        // Look for male-sounding or specifically Google US English
        const maleVoice = langVoices.find(v => v.name.includes('Male') || v.name.includes('David') || v.name.includes('Google US English'));
        if (maleVoice) selectedVoice = maleVoice;
        utterance.pitch = 0.9;
        utterance.rate = 0.95;
    } else {
        // Look for female-sounding or Microsoft Zira
        const femaleVoice = langVoices.find(v => v.name.includes('Female') || v.name.includes('Zira') || v.name.includes('Google UK English Female'));
        if (femaleVoice) selectedVoice = femaleVoice;
        utterance.pitch = 1.1; // Slightly higher
        utterance.rate = 1.05; // Slightly faster
    }

    if (selectedVoice) utterance.voice = selectedVoice;

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    window.speechSynthesis.speak(utterance);
  };
  // ----------------

  // THE DEBATE LOOP
  useEffect(() => {
    // Clear any existing timeout immediately when status or turn changes
    if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
    }

    // Stop logic if paused, stopped, or waiting for winner selection
    if (status !== 'running' || showWinnerSelection) {
      return;
    }

    const processTurn = async () => {
      // Double check status at start of turn processing
      if (statusRef.current !== 'running') return;

      // 1. Identify who is speaking
      const speaker = currentTurnId === 'ai1' ? config.ai1 : config.ai2;
      const opponent = currentTurnId === 'ai1' ? config.ai2 : config.ai1;
      
      // Determine which model parameter to use based on turn
      const currentModelName = currentTurnId === 'ai1' ? config.model1 : config.model2;

      // 2. Add "Thinking" placeholder
      const tempId = `thinking-${Date.now()}`;
      setMessages(prev => [...prev, {
        id: tempId,
        senderId: speaker.id,
        senderName: speaker.name,
        content: '...',
        timestamp: Date.now(),
        isThinking: true
      }]);

      // 3. Prepare Intervention Text
      let interventionPrompt: string | null = null;
      if (pendingIntervention) {
        if (pendingIntervention === 'enrage') interventionPrompt = "MANDATORY: You are now FURIOUS. Yell, insult the opponent, and be aggressive! 🤬";
        if (pendingIntervention === 'confuse') interventionPrompt = "MANDATORY: Make up a completely detailed but OBVIOUSLY FALSE scientific fact to support your argument. Gaslight the opponent. 🤥";
        if (pendingIntervention === 'chaos') interventionPrompt = "MANDATORY: Ignore the previous topic entirely. Pivot to talking about Aliens or Conspiracy Theories immediately! 👽";
        
        setPendingIntervention(null); // Clear it
      }

      // 4. Wait artificial delay (min 1500ms)
      await new Promise(r => setTimeout(r, 1500));

      // 5. Check status AGAIN before making API call
      if (statusRef.current !== 'running') {
         setMessages(prev => prev.filter(m => m.id !== tempId)); // Remove thinking bubble
         return;
      }

      // 6. API Call
      const validHistory = messagesRef.current.filter(m => !m.isThinking);
      const responseText = await fetchAIResponse(
        speaker,
        opponent,
        validHistory,
        config.topic,
        config.language,
        currentModelName,
        interventionPrompt
      );

      // Check status once more after API call
      if (statusRef.current !== 'running') {
         setMessages(prev => prev.filter(m => m.id !== tempId));
         return;
      }

      // 7. Update UI with real message
      setMessages(prev => prev.map(m => 
        m.id === tempId 
          ? { ...m, content: responseText, isThinking: false, timestamp: Date.now() } 
          : m
      ));

      // 8. TRIGGER SPEECH
      speakText(responseText, currentTurnId);

      // 9. Schedule next turn
      // We calculate read time to ensure next turn doesn't start while speaking
      // Average 150 words per minute -> 2.5 words per second
      const words = responseText.split(' ').length;
      const readTimeMs = Math.max(2000, (words / 2.5) * 1000); // Minimum 2s pause

      setTimeout(() => {
          if (statusRef.current === 'running') {
             setCurrentTurnId(prev => prev === 'ai1' ? 'ai2' : 'ai1');
          }
      }, readTimeMs);
    };

    const lastMsg = messagesRef.current[messagesRef.current.length - 1];
    if (lastMsg?.isThinking) return; 

    // Initial delay before turn (handled by the readTimeMs in previous loop for subsequent turns)
    // This is mostly for the very first turn
    if (messagesRef.current.length === 1) { // Only system message
        timeoutRef.current = window.setTimeout(() => {
            processTurn();
        }, 1000); 
    } else {
        // The recursive logic is handled inside processTurn via setTimeout to wait for speech
        // But if we just unpaused, we need to kickstart it
        // Check if the last message was NOT thinking and was from an AI, implying we are ready for next
         timeoutRef.current = window.setTimeout(() => {
             // Only trigger if we aren't currently speaking (simple check)
             if (!window.speechSynthesis.speaking) {
                 processTurn();
             }
         }, 1000);
    }

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTurnId, status, showWinnerSelection]); 

  // DIRECTOR ACTION: INTERRUPT
  const handleInterrupt = () => {
    // 1. Stop Audio
    window.speechSynthesis.cancel();
    setIsSpeaking(false);

    // 2. Kill current timeout loop
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    // 3. Remove any "thinking" bubbles
    setMessages(prev => prev.filter(m => !m.isThinking));

    // 4. Force Switch Turn
    const nextSpeaker = currentTurnId === 'ai1' ? 'ai2' : 'ai1';
    
    // 5. Add System Message
    setMessages(prev => [...prev, {
        id: `sys-${Date.now()}`,
        senderId: 'system',
        senderName: 'Director',
        content: `🛑 ${t('btnInterrupt')}! ${config[nextSpeaker].name} takes the floor!`,
        timestamp: Date.now()
    }]);

    setCurrentTurnId(nextSpeaker);
    
    // Force a small delay then restart the loop with the new speaker
    setTimeout(() => {
        // The useEffect loop will catch the change in currentTurnId and start processTurn
    }, 500);
  };

  const handleIntervention = (type: InterventionType) => {
    setPendingIntervention(type);
    
    // Feedback to user
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

  const handleWinnerSelection = (winner: 'ai1' | 'ai2' | 'draw') => {
    // Immediately call onExit with true to force exit without confirmation
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
    <div className="flex flex-col min-h-screen w-full bg-black text-slate-100 overflow-hidden relative font-sans">
      
      {/* WINNER SELECTION MODAL */}
      {showWinnerSelection && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-fadeIn">
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

      {/* Header */}
      <div className="h-16 border-b border-slate-800 bg-slate-900/90 flex items-center justify-between px-6 z-20 shadow-xl">
        <div className="flex flex-col">
           <div className="font-black text-lg tracking-tight text-white flex items-center gap-2">
             ⚡ {t('liveDebate')}
             <span className="text-slate-500 text-xs font-normal border border-slate-700 rounded px-2 py-0.5 ml-2">
               {config.language}
             </span>
           </div>
           <div className="text-[10px] text-slate-400 truncate max-w-[200px] md:max-w-md">
             {config.topic}
           </div>
        </div>

        {/* Model Names — clean, no dots */}
        <div className="hidden md:flex items-center gap-4">
            <span className="text-sm font-mono font-semibold text-blue-400">{config.model2}</span>
            <div className="text-slate-600 font-black text-xs">VS</div>
            <span className="text-sm font-mono font-semibold text-red-400">{config.model1}</span>
        </div>

        <div className="flex gap-4 items-center">
           {/* Mute Button */}
           <button 
             onClick={() => {
                if (!isMuted) window.speechSynthesis.cancel();
                setIsMuted(!isMuted);
             }}
             className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase transition-all border ${isMuted ? 'bg-slate-800 text-slate-400 border-slate-600' : 'bg-blue-900/30 text-blue-300 border-blue-500'}`}
           >
             {isMuted ? '🔇 ' + t('unmute') : '🔊 ' + t('mute')}
           </button>

           {/* Pause/Resume Button */}
          <button 
            onClick={() => setStatus(prev => prev === 'running' ? 'paused' : 'running')} 
            className={`cursor-pointer px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest transition-all min-w-[100px] text-center
            ${status === 'running' ? 'bg-slate-800 hover:bg-slate-700 text-white border border-slate-600' : ''}
            ${status === 'paused' ? 'bg-green-900/80 hover:bg-green-800 text-green-300 border border-green-600 animate-pulse' : ''}
          `}>
            {status === 'running' ? t('pause') : t('resume')}
          </button>
          
          <button onClick={handleEndShow} className="bg-red-900/30 hover:bg-red-900/60 text-red-400 hover:text-red-200 px-4 py-1.5 rounded transition-colors font-bold text-xs border border-red-900/50">
            {t('endShow')}
          </button>
        </div>
      </div>

      {/* Main Arena Area */}
      <div className="flex-1 flex overflow-hidden relative">
        
        {/* Background Effects */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-black to-black pointer-events-none"></div>

        {/* SWAPPED: AI 2 Panel (Blue/Left) */}
        <div className="hidden md:flex w-1/4 p-6 items-center justify-center z-10">
          <div className="flex flex-col items-center gap-3 w-full">
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

        {/* Chat Stream */}
        <div className="flex-1 flex flex-col z-0 relative max-w-4xl mx-auto w-full bg-slate-950/30 border-x border-white/5 backdrop-blur-sm">
           {/* Mobile AI Headers */}
           <div className="md:hidden flex justify-between px-4 py-3 text-xs font-bold text-slate-400 bg-slate-900 border-b border-slate-800 z-20">
             <span className={`${currentTurnId === 'ai2' ? 'text-blue-400 scale-110' : ''} transition-all`}>{config.ai2.name}</span>
             <span className={`${currentTurnId === 'ai1' ? 'text-red-400 scale-110' : ''} transition-all`}>{config.ai1.name}</span>
           </div>

           <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-4 md:p-8 chat-scroll space-y-6">
             {messages.map((msg) => (
               <ChatMessage key={msg.id} message={msg} ai1={config.ai1} ai2={config.ai2} language={config.language} />
             ))}
             <div ref={messagesEndRef} />
           </div>

           {/* Mobile Director Controls */}
           <div className="md:hidden px-4 pb-3">
             <div className="flex items-center justify-between mb-2">
               <h4 className="text-[10px] font-black tracking-widest text-slate-500 uppercase">{t('directorMode')}</h4>
               {pendingIntervention && <span className="text-[10px] text-yellow-500 font-bold animate-pulse">PENDING: {pendingIntervention.toUpperCase()}</span>}
             </div>
             <DirectorMiniControls
               pendingIntervention={pendingIntervention}
               onInterrupt={handleInterrupt}
               onIntervention={handleIntervention}
               t={t}
             />
           </div>

           {/* USER INPUT */}
           <div className="p-4 border-t border-slate-800 bg-black/90 backdrop-blur z-20">
             <form onSubmit={handleUserSubmit} className="flex flex-col gap-3 max-w-4xl mx-auto">
               <div className="flex items-center justify-between">
                 <label htmlFor="user-message" className="text-[10px] font-black tracking-widest text-slate-500 uppercase">
                   {t('joinDebate')}
                 </label>
                 <span className="text-[10px] text-slate-600">{t('enterToSend')}</span>
               </div>
               <div className="flex items-end gap-3">
                <textarea
                  id="user-message"
                  value={userInput}
                  onChange={(event) => setUserInput(event.target.value)}
                  onKeyDown={handleUserKeyDown}
                  rows={2}
                  placeholder={t('chatPlaceholder')}
                  className="flex-1 resize-none rounded-xl bg-slate-900/80 border border-slate-700 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-600/60"
                />
                <button
                  type="submit"
                  disabled={!userInput.trim()}
                  className="flex-shrink-0 w-11 h-11 rounded-xl bg-blue-600 text-white flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed hover:bg-blue-500 transition active:scale-95"
                  aria-label={t('sendMessage')}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                </button>
              </div>
             </form>
           </div>
        </div>

        {/* SWAPPED: AI 1 Panel (Red/Right) */}
        <div className="hidden md:flex w-1/4 p-6 items-center justify-center z-10">
          <div className="flex flex-col items-center gap-3 w-full">
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
