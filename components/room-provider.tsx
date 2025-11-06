'use client';

import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';

interface RoomContextType {
  roomCode: string | null;
  status: 'none' | 'waiting' | 'countdown' | 'in-progress';
  players: string[];
  countdownRemaining: number | null;
  createRoom: (playerId: string) => Promise<boolean>;
  joinRoom: (roomCode: string, playerId: string) => Promise<boolean>;
  getRoomInfo: (roomCode: string, playerId: string) => Promise<boolean>;
  leaveRoom: () => void;
  resetRoom: () => void;
  startGame: () => void;
}

const RoomContext = createContext<RoomContextType | undefined>(undefined);

export function RoomProvider({ children }: { children: ReactNode }) {
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [status, setStatus] = useState<'none' | 'waiting' | 'countdown' | 'in-progress'>('none');
  const [players, setPlayers] = useState<string[]>([]);
  const [countdownRemaining, setCountdownRemaining] = useState<number | null>(null);
  const [serverCountdownStart, setServerCountdownStart] = useState<number | null>(null);
  const [eventSource, setEventSource] = useState<EventSource | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);

  // Initialize player ID from localStorage or create new one
  useEffect(() => {
    let storedPlayerId = localStorage.getItem('player-id');
    if (!storedPlayerId) {
      storedPlayerId = `player_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem('player-id', storedPlayerId);
    }
    setPlayerId(storedPlayerId);
  }, []);

  const connectToRoomUpdates = useCallback((roomCode: string, playerId: string) => {
    // Close existing connection if any
    if (eventSource) {
      eventSource.close();
    }

    // Create new SSE connection for room updates
    const sseUrl = `/api/sse/room?roomCode=${roomCode}&playerId=${playerId}`;
    // Add cache-busting and heartbeat parameters to prevent browser connection issues
    const newEventSource = new EventSource(`${sseUrl}&t=${Date.now()}&hb=1`);

    newEventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setRoomCode(data.roomCode);
        setPlayers(data.players);
        setStatus(data.status as 'none' | 'waiting' | 'countdown' | 'in-progress');
        
        // Handle countdown state with server sync
        if (data.status === 'countdown') {
          if ('remainingCountdown' in data) {
            // Use server-provided remaining countdown time
            setCountdownRemaining(data.remainingCountdown);
            // Calculate when the countdown started based on server info
            if (data.timestamp && data.remainingCountdown) {
              const countdownDuration = 10000; // 10 seconds as used in SSE
              const now = Date.now();
              const elapsedSinceTimestamp = now - data.timestamp;
              const accurateRemaining = Math.max(0, data.remainingCountdown - elapsedSinceTimestamp);
              setCountdownRemaining(accurateRemaining);
              
              // Calculate when the countdown actually started
              const countdownStart = now - (countdownDuration - accurateRemaining);
              setServerCountdownStart(countdownStart);
            } else {
              setCountdownRemaining(data.remainingCountdown);
            }
          } else if (data.countdownStart) {
            // If server provides countdown start time, calculate remaining
            const countdownDuration = 10000; // 10 seconds as used in SSE
            const elapsed = Date.now() - data.countdownStart;
            const remaining = Math.max(0, countdownDuration - elapsed);
            setCountdownRemaining(remaining);
            setServerCountdownStart(data.countdownStart);
          }
        } else {
          // Reset countdown when not in countdown state
          setCountdownRemaining(null);
          setServerCountdownStart(null);
        }
        
        // Always update countdownRemaining when present in the data
        if ('remainingCountdown' in data && data.status === 'countdown') {
          setCountdownRemaining(data.remainingCountdown);
        }
      } catch (error) {
        console.error('Error parsing room update:', error);
      }
    };

    newEventSource.onerror = (error) => {
      console.error('SSE error for room updates:', error);
      // Close the erroring connection to prevent further errors
      newEventSource.close();
      
      // Try to reconnect after a delay
      setTimeout(() => {
        if (roomCode && playerId) {
          connectToRoomUpdates(roomCode, playerId);
        }
      }, 1000); // Faster reconnect time
    };

    // Add connection event for debugging
    newEventSource.onopen = () => {
      console.log('SSE connection opened for room:', roomCode);
    };

    setEventSource(newEventSource);
  }, [eventSource]);

  // Add visibility change handler to reconnect when tab becomes visible again
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && roomCode && playerId && status === 'countdown') {
        // Reconnect to ensure we get updates if the connection was throttled
        connectToRoomUpdates(roomCode, playerId);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [roomCode, playerId, status, connectToRoomUpdates]);

  // Client-side countdown timer that runs independently of SSE
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;

    if (status === 'countdown' && serverCountdownStart !== null) {
      // Start client-side countdown timer
      interval = setInterval(() => {
        const elapsed = Date.now() - serverCountdownStart;
        const clientSideRemaining = Math.max(0, 10000 - elapsed); // 10-second countdown as used in SSE
        
        if (clientSideRemaining <= 0) {
          // Countdown finished, update status
          setStatus('in-progress');
          setCountdownRemaining(0);
          if (interval) {
            clearInterval(interval);
          }
        } else {
          // Update remaining time with client-side calculation
          setCountdownRemaining(clientSideRemaining);
        }
      }, 100); // Update every 100ms for smooth animation
    } else if (interval) {
      clearInterval(interval);
    }

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [status, serverCountdownStart]); // Only include status and serverCountdownStart in dependency array

  // Add visibility change handler to pause/resume countdown when tab visibility changes
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && roomCode && playerId && status === 'countdown') {
        // Reconnect to get latest state when tab becomes visible again
        connectToRoomUpdates(roomCode, playerId);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [roomCode, playerId, status, connectToRoomUpdates]);

  const createRoom = useCallback(async (playerId: string) => {
    if (!playerId) return false;
    
    try {
      const response = await fetch('/api/room', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ playerId }),
      });

      const data = await response.json();

      if (response.ok) {
        setRoomCode(data.roomCode);
        setStatus(data.status);
        setPlayers([playerId]);
        connectToRoomUpdates(data.roomCode, playerId);
        return true;
      } else {
        console.error('Error creating room:', data.error);
        return false;
      }
    } catch (error) {
      console.error('Error creating room:', error);
      return false;
    }
  }, [connectToRoomUpdates]);

  const joinRoom = useCallback(async (roomCode: string, playerId: string) => {
    if (!roomCode || !playerId) return false;
    
    try {
      const response = await fetch('/api/room', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ roomCode, playerId }),
      });

      const data = await response.json();

      if (response.ok) {
        setRoomCode(data.roomCode);
        setStatus(data.status);
        setPlayers(data.players);
        setCountdownRemaining(data.status === 'countdown' ? (data.remainingCountdown || null) : null);
        setServerCountdownStart(data.countdownStart || null);
        connectToRoomUpdates(data.roomCode, playerId);
        return true;
      } else {
        console.error('Error joining room:', data.error);
        return false;
      }
    } catch (error) {
      console.error('Error joining room:', error);
      return false;
    }
  }, [connectToRoomUpdates]);

  const getRoomInfo = useCallback(async (roomCode: string, playerId: string) => {
    if (!roomCode || !playerId) return false;
    
    try {
      const response = await fetch(`/api/room?roomCode=${roomCode}&playerId=${playerId}`, {
        method: 'GET',
      });

      const data = await response.json();

      if (response.ok) {
        setRoomCode(data.roomCode);
        setStatus(data.status);
        setPlayers(data.players);
        setCountdownRemaining(data.status === 'countdown' ? (data.remainingCountdown || null) : null);
        setServerCountdownStart(data.countdownStart || null);
        connectToRoomUpdates(data.roomCode, playerId);
        return true;
      } else {
        console.error('Error getting room info:', data.error);
        return false;
      }
    } catch (error) {
      console.error('Error getting room info:', error);
      return false;
    }
  }, [connectToRoomUpdates]);

  const leaveRoom = useCallback(async () => {
    if (eventSource) {
      eventSource.close();
    }
    
    // If we have a room code and player ID, make an API call to properly leave the room
    if (roomCode && playerId) {
      try {
        await fetch('/api/room/leave', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ roomCode, playerId }),
        });
      } catch (error) {
        console.error('Error leaving room:', error);
      }
    }
    
    setRoomCode(null);
    setStatus('none');
    setPlayers([]);
    setCountdownRemaining(null);
    setEventSource(null);
  }, [eventSource, roomCode, playerId]);

  const resetRoom = useCallback(() => {
    // Use this to completely reset the room context
    if (eventSource) {
      eventSource.close();
    }
    setRoomCode(null);
    setStatus('none');
    setPlayers([]);
    setCountdownRemaining(null);
    setServerCountdownStart(null);
    setEventSource(null);
  }, [eventSource]);

  const startGame = useCallback(() => {
    // This would be called when countdown completes
    setStatus('in-progress');
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [eventSource]);

  const value = {
    roomCode,
    status,
    players,
    countdownRemaining,
    createRoom,
    joinRoom,
    getRoomInfo,
    leaveRoom,
    resetRoom,
    startGame,
  };

  return (
    <RoomContext.Provider value={value}>
      {children}
    </RoomContext.Provider>
  );
}

export function useRoom() {
  const context = useContext(RoomContext);
  if (!context) {
    throw new Error('useRoom must be used within a RoomProvider');
  }
  return context;
}