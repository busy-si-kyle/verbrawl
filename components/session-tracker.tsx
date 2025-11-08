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
    
    // Remove session from count
    const removeSession = async () => {
      try {
        await fetch('/api/player-count/remove', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-session-id': sessionId,
          },
          body: JSON.stringify({ sessionId }),
          // Use keepalive to ensure request completes even if page is closing
          keepalive: true,
        });
      } catch (error) {
        console.error('Error removing session:', error);
      }
    };
    
    // Register immediately when component mounts
    registerSession();
    
    // IMPROVEMENT: Update session every 30 seconds (was 2 minutes)
    // This keeps sessions alive and detects new players faster
    const interval = setInterval(registerSession, 30 * 1000);
    
    // IMPROVEMENT: Handle visibility change for better cleanup
    // This fires when user switches tabs, minimizes window, etc.
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'hidden') {
        // Try to remove session when tab becomes hidden
        // This is more reliable than beforeunload on mobile devices
        await removeSession();
      } else if (document.visibilityState === 'visible') {
        // Re-register session when tab becomes visible again
        await registerSession();
      }
    };
    
    // IMPROVEMENT: Enhanced beforeunload handler with keepalive
    // This is a fallback for cases where visibilitychange doesn't fire
    const handleBeforeUnload = () => {
      // Use removeSession which has keepalive flag
      removeSession();
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      // Try to remove session on component unmount as well
      removeSession();
    };
  }, []);
  
  return null;
}