'use client';

import { useEffect } from 'react';

export function SessionTracker() {
  useEffect(() => {
    // Generate a consistent session ID using a more stable method
    let sessionId = localStorage.getItem('player-session');
    if (!sessionId) {
      // Create a new session ID that will persist across page reloads
      sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem('player-session', sessionId);
    }
    
    // Send session registration to API
    const registerSession = async () => {
      try {
        await fetch('/api/player-count', {
          method: 'GET',
          headers: {
            'x-session-id': sessionId,
          },
        });
      } catch (error) {
        console.error('Error registering session:', error);
      }
    };
    
    // Register immediately when component mounts
    registerSession();
    
    // Update session every 2 minutes to keep it active
    const interval = setInterval(registerSession, 2 * 60 * 1000);
    
    // Cleanup session when user leaves the page
    const handleBeforeUnload = async () => {
      try {
        await fetch('/api/player-count/remove', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-session-id': sessionId,
          },
          body: JSON.stringify({ sessionId }),
        });
      } catch (error) {
        console.error('Error removing session:', error);
      }
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      clearInterval(interval);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);
  
  return null;
}