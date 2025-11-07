// components/realtime-player-count-provider.tsx
'use client';

import { createContext, useContext, useEffect, useState, ReactNode, useCallback, useRef } from 'react';

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
  
  // Ref to hold the connection function to avoid closure issues
  const connectRef = useRef<(() => () => void) | null>(null);

  // Define the connection function
  const createConnection = useCallback((): (() => void) => {
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
      
      // Attempt to reconnect after a delay using the ref
      setTimeout(() => {
        if (connectRef.current) {
          connectRef.current();
        }
      }, 5000);
    };

    // Return clean up function
    return () => {
      eventSource.close();
    };
  }, []);

  // Update ref whenever createConnection changes
  useEffect(() => {
    connectRef.current = createConnection;
  }, [createConnection]);

  useEffect(() => {
    if (connectRef.current) {
      const cleanup = connectRef.current();
      
      return () => {
        cleanup?.();
      };
    }
  }, []);

  return (
    <RealtimePlayerCountContext.Provider value={{ count: playerCount, status }}>
      {children}
    </RealtimePlayerCountContext.Provider>
  );
}

export const useRealtimePlayerCount = () => useContext(RealtimePlayerCountContext);