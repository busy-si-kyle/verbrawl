// components/player-count-provider.tsx
'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

interface PlayerCountContextType {
  count: number;
}

const PlayerCountContext = createContext<PlayerCountContextType>({ count: 0 });

export function PlayerCountProvider({ children }: { children: ReactNode }) {
  const [playerCount, setPlayerCount] = useState(0);

  useEffect(() => {
    // Fetch player count only
    const fetchPlayerCount = async () => {
      try {
        const response = await fetch('/api/player-count', {
          headers: {
            // Don't send a session ID - just fetch the count
          }
        });
        if (response.ok) {
          const data = await response.json();
          setPlayerCount(data.count);
        }
      } catch (error) {
        console.error('Error fetching player count:', error);
      }
    };

    // Initial fetch and then every 30 seconds
    fetchPlayerCount();
    const countInterval = setInterval(fetchPlayerCount, 30000);

    return () => {
      clearInterval(countInterval);
    };
  }, []);

  return (
    <PlayerCountContext.Provider value={{ count: playerCount }}>
      {children}
    </PlayerCountContext.Provider>
  );
}

export const usePlayerCount = () => useContext(PlayerCountContext);