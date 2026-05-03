import React, { useState, useEffect } from 'react';
import { SetupScreen } from './components/SetupScreen';
import { ArenaScreen } from './components/ArenaScreen';
import { DebateConfig } from './types';
import { onAuthChange, signInWithGoogle, signOut, User } from './src/firebase';

const App: React.FC = () => {
  const [debateConfig, setDebateConfig] = useState<DebateConfig | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthChange((u) => {
      setUser(u);
      setAuthLoading(false);
    });
    return () => unsub();
  }, []);

  const handleStart = (config: DebateConfig) => {
    setDebateConfig(config);
  };

  const handleExit = (force: boolean = false) => {
    if (force) {
      setDebateConfig(null);
      return;
    }
    if (window.confirm("Are you sure you want to end this debate session?")) {
      setDebateConfig(null);
    }
  };

  const handleSignIn = () => {
    signInWithGoogle().catch((err) => {
      console.error("Sign in failed:", err);
      alert("Sign in failed. Check console for details.");
    });
  };

  const handleSignOut = () => {
    signOut().catch(console.error);
  };

  if (authLoading) {
    return (
      <div className="h-screen w-screen bg-black flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <>
      {!debateConfig ? (
        <SetupScreen onStart={handleStart} user={user} onSignIn={handleSignIn} onSignOut={handleSignOut} />
      ) : (
        <ArenaScreen config={debateConfig} onExit={handleExit} />
      )}
    </>
  );
};

export default App;
