import React, { useState } from 'react';
import { SetupScreen } from './components/SetupScreen';
import { ArenaScreen } from './components/ArenaScreen';
import { DebateConfig } from './types';

const App: React.FC = () => {
  const [debateConfig, setDebateConfig] = useState<DebateConfig | null>(null);

  const handleStart = (config: DebateConfig) => {
    setDebateConfig(config);
  };

  // Modified to accept a 'force' parameter to bypass the confirmation dialog
  const handleExit = (force: boolean = false) => {
    if (force) {
      setDebateConfig(null);
      return;
    }
    
    if (window.confirm("Are you sure you want to end this debate session?")) {
      setDebateConfig(null);
    }
  };

  return (
    <>
      {!debateConfig ? (
        <SetupScreen onStart={handleStart} />
      ) : (
        <ArenaScreen config={debateConfig} onExit={handleExit} />
      )}
    </>
  );
};

export default App;
