import React, { useState, useEffect, useCallback } from 'react';
import { ArenaScreen } from './components/ArenaScreen';
import { DebateConfig, AICharacter } from './types';
import { RANDOM_TOPICS, FAKE_MODELS, generateRandomCharacter, getRandomElement } from './constants';

const makeDefaultConfig = (): DebateConfig => {
  const topic = getRandomElement(RANDOM_TOPICS);
  const ai1 = generateRandomCharacter('ai1', 'bg-red-700');
  const ai2 = generateRandomCharacter('ai2', 'bg-blue-700');
  // Rolleri netleştir ama karakteri bozma
  ai1.role = 'Opponent';
  ai2.role = 'Defender';
  return {
    topic,
    ai1,
    ai2,
    language: 'English',
    model1: 'Gemma4 31B',   // Sağ/Kırmızı
    model2: 'DeepSeek V3.1 671B', // Sol/Mavi
  };
};

const App: React.FC = () => {
  const [debateConfig, setDebateConfig] = useState<DebateConfig>(makeDefaultConfig);
  const [sessionKey, setSessionKey] = useState(0); // Arena'yı resetlemek için

  const handleStart = useCallback((config: DebateConfig) => {
    setDebateConfig(config);
    setSessionKey(k => k + 1);
  }, []);

  const handleExit = useCallback((force: boolean = false) => {
    if (force) {
      setDebateConfig(makeDefaultConfig());
      setSessionKey(k => k + 1);
      return;
    }
    if (window.confirm("Are you sure you want to end this debate session?")) {
      setDebateConfig(makeDefaultConfig());
      setSessionKey(k => k + 1);
    }
  }, []);

  return <ArenaScreen key={sessionKey} config={debateConfig} onExit={handleExit} onNewConfig={handleStart} />;
};

export default App;
