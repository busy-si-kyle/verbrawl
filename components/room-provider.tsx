'use client';

import { createContext, useContext, useEffect, useState, ReactNode, useCallback, useRef } from 'react';

interface RoomContextType {
  roomCode: string | null;
  status: 'none' | 'waiting' | 'countdown' | 'in-progress';
  players: string[];
  playerNicknames: Record<string, string>;
  scores: Record<string, number>;
  words: string[];
  gameOver: boolean;
  winner: string | null;
  countdownRemaining: number | null;
  readyPlayers: string[];
  createRoom: (playerId: string) => Promise<boolean>;
  joinRoom: (roomCode: string, playerId: string) => Promise<boolean>;
  getRoomInfo: (roomCode: string, playerId: string) => Promise<boolean>;
  leaveRoom: () => void;
  resetRoom: () => void;
  startGame: () => void;
  toggleReady: (playerId: string) => Promise<void>;
}

const RoomContext = createContext<RoomContextType | undefined>(undefined);

export function RoomProvider({ children }: { children: ReactNode }) {
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [status, setStatus] = useState<'none' | 'waiting' | 'countdown' | 'in-progress'>('none');
  const [players, setPlayers] = useState<string[]>([]);
  const [playerNicknames, setPlayerNicknames] = useState<Record<string, string>>({});
  const [scores, setScores] = useState<Record<string, number>>({});
  const [words, setWords] = useState<string[]>([]);
  const [gameOver, setGameOver] = useState<boolean>(false);
  const [winner, setWinner] = useState<string | null>(null);
  const [countdownRemaining, setCountdownRemaining] = useState<number | null>(null);
  const [serverCountdownStart, setServerCountdownStart] = useState<number | null>(null);
  const [readyPlayers, setReadyPlayers] = useState<string[]>([]);
  const [eventSource, setEventSource] = useState<EventSource | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);

  // Ref to hold the connection function to avoid closure issues
  const connectToRoomUpdatesRef = useRef<((roomCode: string, connectionPlayerId: string) => void) | null>(null);
  const roomCodeRef = useRef<string | null>(null);

  // Keep room code ref in sync
  useEffect(() => {
    roomCodeRef.current = roomCode;
  }, [roomCode]);

  // Initialize player ID from localStorage or create new one
  const [storedPlayerId] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      let playerIdValue = localStorage.getItem('player-id');
      if (!playerIdValue) {
        playerIdValue = `player_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        localStorage.setItem('player-id', playerIdValue);
      }
      return playerIdValue;
    }
    // Server-side fallback - generate a temporary ID that will be replaced on client
    return `temp_player_${Date.now()}`;
  });

  const createRoomUpdatesConnection = useCallback((roomCode: string, connectionPlayerId: string) => {
    // Close existing connection if any
    const currentEventSource = eventSource; // Capture current eventSource value
    if (currentEventSource) {
      currentEventSource.close();
    }

    // Create new SSE connection for room updates
    const sseUrl = `/api/sse/room?roomCode=${roomCode}&playerId=${connectionPlayerId}`;
    // Add cache-busting and heartbeat parameters to prevent browser connection issues
    const newEventSource = new EventSource(`${sseUrl}&t=${Date.now()}&hb=1`);

    newEventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setRoomCode(data.roomCode);
        setPlayers(data.players);
        if (data.playerNicknames) {
          setPlayerNicknames(data.playerNicknames);
        }
        if (data.scores) {
          setScores(data.scores);
        }
        if (data.words) {
          setWords(data.words);
        }
        if ('gameOver' in data) {
          setGameOver(data.gameOver);
        }
        if ('winner' in data) {
          setWinner(data.winner);
        }
        if (data.readyPlayers) {
          setReadyPlayers(data.readyPlayers);
        }
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
      // Only log actual errors, not normal closures during navigation
      if (newEventSource.readyState !== EventSource.CLOSED) {
        console.error('SSE error for room updates:', error);
      }

      // Close the erroring connection to prevent further errors
      newEventSource.close();

      // Only try to reconnect if we're still in a room (roomCode exists)
      // This prevents reconnection attempts after leaving
      setTimeout(async () => {
        // Check if we're still in the same room before reconnecting
        if (roomCodeRef.current === roomCode && storedPlayerId && connectToRoomUpdatesRef.current) {
          // Verify room still exists before reconnecting
          try {
            const checkResponse = await fetch(`/api/room?roomCode=${roomCode}&playerId=${storedPlayerId}`);
            if (checkResponse.status === 404) {
              console.log('Room no longer exists, stopping SSE reconnection');
              setRoomCode(null);
              setStatus('none');
              setPlayers([]);
              return;
            }
          } catch (e) {
            // Ignore network errors during check, just try to reconnect
          }

          console.log('Attempting to reconnect SSE for room:', roomCode);
          connectToRoomUpdatesRef.current(roomCode, storedPlayerId);
        } else {
          console.log('Not reconnecting SSE - room code changed or cleared');
        }
      }, 1000);
    };

    // Add connection event for debugging
    newEventSource.onopen = () => {
      console.log('SSE connection opened for room:', roomCode);
    };

    setEventSource(newEventSource);
  }, [eventSource]); // Dependencies are captured properly

  // Update ref whenever createRoomUpdatesConnection changes
  useEffect(() => {
    connectToRoomUpdatesRef.current = createRoomUpdatesConnection;
  }, [createRoomUpdatesConnection]);

  // Add visibility change handler to reconnect when tab becomes visible again
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && roomCode && storedPlayerId && status === 'countdown' && connectToRoomUpdatesRef.current) {
        // Reconnect to ensure we get updates if the connection was throttled
        connectToRoomUpdatesRef.current(roomCode, storedPlayerId);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [roomCode, storedPlayerId, status, connectToRoomUpdatesRef]);

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
      if (document.visibilityState === 'visible' && roomCode && playerId && status === 'countdown' && connectToRoomUpdatesRef.current) {
        // Reconnect to get latest state when tab becomes visible again
        connectToRoomUpdatesRef.current(roomCode, playerId);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [roomCode, playerId, status, connectToRoomUpdatesRef]);

  const createRoom = useCallback(async (roomPlayerId: string) => {
    if (!roomPlayerId) return false;

    // Get the nickname from localStorage
    const nickname = typeof window !== 'undefined' ? localStorage.getItem('player-nickname') || 'You' : 'You';

    try {
      const response = await fetch('/api/room', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          playerId: roomPlayerId,
          nickname: nickname
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setRoomCode(data.roomCode);
        setStatus(data.status);
        setPlayers(data.players || [roomPlayerId]);
        // Set initial player nicknames from the API response
        setPlayerNicknames(data.playerNicknames || { [roomPlayerId]: nickname });
        // Set initial scores from the API response
        setScores(data.scores || { [roomPlayerId]: 0 });
        // Set initial words and game state
        setWords(data.words || []);
        setGameOver(data.gameOver || false);
        setWinner(data.winner || null);
        setReadyPlayers(data.readyPlayers || []);
        if (connectToRoomUpdatesRef.current) {
          connectToRoomUpdatesRef.current(data.roomCode, roomPlayerId);
        }
        return true;
      } else {
        console.error('Error creating room:', data.error);
        return false;
      }
    } catch (error) {
      console.error('Error creating room:', error);
      return false;
    }
  }, [connectToRoomUpdatesRef]);

  const joinRoom = useCallback(async (roomCode: string, roomPlayerId: string) => {
    if (!roomCode || !roomPlayerId) return false;

    // Get the nickname from localStorage
    const nickname = typeof window !== 'undefined' ? localStorage.getItem('player-nickname') || 'Opponent' : 'Opponent';

    try {
      const response = await fetch('/api/room', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          roomCode,
          playerId: roomPlayerId,
          nickname: nickname
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setRoomCode(data.roomCode);
        setStatus(data.status);
        setPlayers(data.players);
        // Set player nicknames from the API response
        setPlayerNicknames(data.playerNicknames || {});
        // Set scores, words, and game state from the API response
        setScores(data.scores || {});
        setWords(data.words || []);
        setGameOver(data.gameOver || false);
        setWinner(data.winner || null);
        setReadyPlayers(data.readyPlayers || []);
        setCountdownRemaining(data.status === 'countdown' ? (data.remainingCountdown || null) : null);
        setServerCountdownStart(data.countdownStart || null);
        if (connectToRoomUpdatesRef.current) {
          connectToRoomUpdatesRef.current(data.roomCode, roomPlayerId);
        }
        return true;
      } else {
        console.error('Error joining room:', data.error);
        return false;
      }
    } catch (error) {
      console.error('Error joining room:', error);
      return false;
    }
  }, [connectToRoomUpdatesRef]);

  const getRoomInfo = useCallback(async (roomCode: string, roomPlayerId: string) => {
    if (!roomCode || !roomPlayerId) return false;

    try {
      const response = await fetch(`/api/room?roomCode=${roomCode}&playerId=${roomPlayerId}`, {
        method: 'GET',
      });

      const data = await response.json();

      if (response.ok) {
        setRoomCode(data.roomCode);
        setStatus(data.status);
        setPlayers(data.players);
        // Set player nicknames from the API response
        setPlayerNicknames(data.playerNicknames || {});
        // Set scores, words, and game state from the API response
        setScores(data.scores || {});
        setWords(data.words || []);
        setGameOver(data.gameOver || false);
        setWinner(data.winner || null);
        setReadyPlayers(data.readyPlayers || []);
        setCountdownRemaining(data.status === 'countdown' ? (data.remainingCountdown || null) : null);
        setServerCountdownStart(data.countdownStart || null);
        if (connectToRoomUpdatesRef.current) {
          connectToRoomUpdatesRef.current(data.roomCode, roomPlayerId);
        }
        return true;
      } else {
        console.error('Error getting room info:', data.error);
        return false;
      }
    } catch (error) {
      console.error('Error getting room info:', error);
      return false;
    }
  }, [connectToRoomUpdatesRef]);

  const leaveRoom = useCallback(async () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    // If we have a room code and player ID, make an API call to properly leave the room
    if (roomCode && storedPlayerId) {
      try {
        await fetch('/api/room/leave', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ roomCode, playerId: storedPlayerId }),
        });
      } catch (error) {
        console.error('Error leaving room:', error);
      }
    }

    setRoomCode(null);
    setStatus('none');
    setPlayers([]);
    setScores({}); // Reset scores when leaving room
    setWords([]); // Reset words when leaving room
    setGameOver(false); // Reset game over state when leaving room
    setWinner(null); // Reset winner when leaving room
    setReadyPlayers([]); // Reset ready players when leaving room
    setCountdownRemaining(null);
    setEventSource(null);
  }, [roomCode, storedPlayerId]);

  const resetRoom = useCallback(() => {
    // Use this to completely reset the room context
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }
    setRoomCode(null);
    setStatus('none');
    setPlayers([]);
    setPlayerNicknames({}); // Reset player nicknames when resetting room
    setScores({}); // Reset scores when resetting room
    setWords([]); // Reset words when resetting room
    setGameOver(false); // Reset game over state when resetting room
    setWinner(null); // Reset winner when resetting room
    setReadyPlayers([]); // Reset ready players when resetting room
    setCountdownRemaining(null);
    setServerCountdownStart(null);
    setEventSource(null);
  }, []);

  const startGame = useCallback(() => {
    // This would be called when countdown completes
    setStatus('in-progress');
  }, []);

  const toggleReady = useCallback(async (playerId: string) => {
    if (!roomCode) return;

    try {
      await fetch('/api/room/ready', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          roomCode,
          playerId
        }),
      });
    } catch (error) {
      console.error('Error toggling ready status:', error);
    }
  }, [roomCode]);

  // Ref to track the current event source for cleanup
  const eventSourceRef = useRef<EventSource | null>(null);

  // Keep eventSourceRef in sync with state
  useEffect(() => {
    eventSourceRef.current = eventSource;
  }, [eventSource]);

  // Cleanup on unmount only
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        console.log('Component unmounting, closing SSE connection');
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, []); // Empty deps - only run on mount/unmount

  const value = {
    roomCode,
    status,
    players,
    playerNicknames,
    scores,
    words,
    gameOver,
    winner,
    countdownRemaining,
    readyPlayers,
    createRoom,
    joinRoom,
    getRoomInfo,
    leaveRoom,
    resetRoom,
    startGame,
    toggleReady,
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