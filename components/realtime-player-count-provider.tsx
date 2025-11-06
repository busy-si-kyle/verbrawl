// components/realtime-player-count-provider.tsx
'use client';

import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';

interface RealtimePlayerCountContextType {
  count: number;
  status: 'connecting' | 'connected' | 'disconnected';
}

const RealtimePlayerCountContext = createContext<RealtimePlayerCountContextType>({ 
  count: 0, 
  status: 'connecting' 
});

export function RealtimePlayerCountProvider({ children }: { children: ReactNode }) {
  const [playerCount, setPlayerCount] = useState(0);
  const [status, setStatus] = useState<RealtimePlayerCountContextType['status']>('connecting');

  const connect = useCallback(() => {
    setStatus('connecting');
    
    const eventSource = new EventSource('/api/sse/player-count');

    eventSource.onopen = () => {
      setStatus('connected');
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setPlayerCount(data.playerCount);
      } catch (error) {
        console.error('Error parsing player count update:', error);
      }
    };

    eventSource.onerror = (error) => {
      console.error('SSE error:', error);
      setStatus('disconnected');
      eventSource.close();
      
      // Attempt to reconnect after a delay
      setTimeout(() => {
        connect();
      }, 5000);
    };

    // Clean up function
    return () => {
      eventSource.close();
    };
  }, []);

  useEffect(() => {
    const cleanup = connect();
    
    return () => {
      cleanup && cleanup();
    };
  }, [connect]);

  return (
    <RealtimePlayerCountContext.Provider value={{ count: playerCount, status }}>
      {children}
    </RealtimePlayerCountContext.Provider>
  );
}

export const useRealtimePlayerCount = () => useContext(RealtimePlayerCountContext);