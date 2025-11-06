'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { useRoom } from '@/components/room-provider';
import { CountdownTimer } from '@/components/countdown-timer';
import WordleGrid from '@/components/wordle-grid';
import Keyboard from '@/components/keyboard';

export default function RaceRoomPage() {
  const params = useParams();
  const roomCode = params.id as string;
  const router = useRouter();
  const { 
    status, 
    players, 
    countdownRemaining, 
    getRoomInfo, 
    leaveRoom,
    createRoom: createRoomWithProvider
  } = useRoom();
  const [isJoining, setIsJoining] = useState(true); // Set to true initially since we're trying to join
  const [error, setError] = useState<string | null>(null);
  const [initialLoad, setInitialLoad] = useState(true);
  // Track if we've seen the first status update from SSE to prevent flickering
  const [hasReceivedStatusUpdate, setHasReceivedStatusUpdate] = useState(false);
  const WORD_LENGTH = 5;
  const MAX_ATTEMPTS = 6;
  
  // Initialize the board
  const initialBoard = Array(MAX_ATTEMPTS).fill(null).map(() => 
    Array(WORD_LENGTH).fill('')
  );
  
  const [board, setBoard] = useState<string[][]>(initialBoard);
  const [currentRow, setCurrentRow] = useState<number>(0);
  const [currentCol, setCurrentCol] = useState<number>(0);
  const [revealed, setRevealed] = useState<boolean[][]>(
    Array(MAX_ATTEMPTS).fill(null).map(() => Array(WORD_LENGTH).fill(false))
  );
  const [usedKeys, setUsedKeys] = useState<Record<string, string>>({});

  const [gameOver, setGameOver] = useState(false);
  const [playerStats, setPlayerStats] = useState({
    completed: false,
    timeTaken: 0
  });
  
  // Track scores for both players
  const [playerScores, setPlayerScores] = useState<Record<string, number>>({});
  

  const [playerId] = useState(() => {
    if (typeof window !== 'undefined') {
      let id = localStorage.getItem('player-id');
      if (!id) {
        id = `player_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        localStorage.setItem('player-id', id);
      }
      return id;
    }
    return '';
  });

  // Try to join the room when component mounts
  useEffect(() => {
    if (roomCode && playerId) {
      setIsJoining(true);
      setInitialLoad(true);
      console.log('Attempting to connect to room:', roomCode);
      // Try to get room info (this will work for both joining and if user is already in the room)
      getRoomInfo(roomCode, playerId).then((success) => {
        if (!success) {
          // If getting room info failed, it might be because we need to join
          setError('Room does not exist or you do not have access to it.');
          setIsJoining(false);
          setInitialLoad(false);
        } else {
          setIsJoining(false);
          setInitialLoad(false);
          console.log('Successfully connected to room:', roomCode, 'Status:', status);
        }
      }).catch((error) => {
        console.error('Error connecting to room:', error);
        setError('Failed to connect to room. Please try again.');
        setIsJoining(false);
        setInitialLoad(false);
      });
    }
  }, [roomCode, playerId, getRoomInfo]); // Removed status from dependency array to avoid infinite loop

  // Initialize player scores when players join the room
  useEffect(() => {
    if (players.length > 0) {
      const initialScores: Record<string, number> = {};
      players.forEach(player => {
        initialScores[player] = 0;
      });
      setPlayerScores(initialScores);
    }
  }, [players]);

  // Track when we first receive a non-default status from SSE to prevent flickering
  useEffect(() => {
    // Only set hasReceivedStatusUpdate to true if the status is not the initial default
    if (status !== 'none') {
      setHasReceivedStatusUpdate(true);
    }
  }, [status]);



  // Update player score
  const updatePlayerScore = (playerId: string, points: number) => {
    setPlayerScores(prev => ({
      ...prev,
      [playerId]: (prev[playerId] || 0) + points
    }));
  };

  // Handle keyboard input for the Wordle grid
  const handleKeyPress = (key: string) => {
    if (gameOver || status !== 'in-progress') return;
    
    if (key === 'Enter') {
      if (currentCol !== WORD_LENGTH) {
        // Row is not complete
        return;
      }
      
      // Mark this row as revealed (in a multiplayer game, we might submit to server)
      const newRevealed = [...revealed];
      newRevealed[currentRow] = Array(WORD_LENGTH).fill(true);
      setRevealed(newRevealed);
      
      // Update key statuses based on this guess - for now we'll mark all as present/absent
      // In a real game, we'd check against the actual solution
      const newUsedKeys = {...usedKeys};
      let correctLetters = 0;
      board[currentRow].forEach((letter) => {
        if (letter && !newUsedKeys[letter]) {
          // In a real game, we'd determine if letter is correct, present, or absent
          newUsedKeys[letter] = 'present'; // Placeholder logic
          correctLetters++; // Count correct letters for scoring
        }
      });
      setUsedKeys(newUsedKeys);
      
      // Award points for correct letters
      if (correctLetters > 0) {
        updatePlayerScore(playerId, correctLetters);
      }
      
      // Move to next row or end game
      if (currentRow === MAX_ATTEMPTS - 1) {
        // Game over - no more attempts
        setGameOver(true);
        setPlayerStats({
          completed: false,
          timeTaken: 0
        });
      } else {
        setCurrentRow(currentRow + 1);
        setCurrentCol(0);
      }
    } else if (key === 'Backspace') {
      if (currentCol > 0) {
        const newBoard = [...board];
        newBoard[currentRow][currentCol - 1] = '';
        setBoard(newBoard);
        setCurrentCol(currentCol - 1);
      }
    } else {
      // Regular letter
      if (currentCol < WORD_LENGTH) {
        const newBoard = [...board];
        newBoard[currentRow][currentCol] = key;
        setBoard(newBoard);
        setCurrentCol(currentCol + 1);
      }
    }
  };

  // Handle physical keyboard events
  useEffect(() => {
    if (status !== 'in-progress' || gameOver) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      
      if (/^[a-zA-Z]$/.test(e.key) && e.key.length === 1) {
        handleKeyPress(e.key.toUpperCase());
      } else if (e.key === 'Enter') {
        handleKeyPress('Enter');
      } else if (e.key === 'Backspace') {
        handleKeyPress('Backspace');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentRow, currentCol, gameOver, status]);

  const handleLeaveRoom = () => {
    leaveRoom();
    router.push('/race');
  };

  // Wait until we've received the first status update to prevent flickering
  if (!hasReceivedStatusUpdate) {
    return (
      <div className="flex min-h-screen flex-col bg-background font-sans antialiased">
        <Header subtitle="Race Mode" />
        <main className="flex flex-1 flex-col items-center justify-center p-4 sm:p-6 md:p-8 lg:py-12">
          <div className="w-full max-w-2xl">
            <Card className="border border-gray-700">
              <CardHeader className="text-center">
                <CardTitle className="text-2xl sm:text-3xl sr-only">Race Mode</CardTitle>
                <CardDescription>
                  Room: <span className="font-mono font-bold">{roomCode}</span>
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <p>Establishing connection...</p>
                  {/* Placeholder for player indicators and scores during loading */}
                  <div className="flex justify-between min-h-[50px] items-center">
                    <div className="px-4 py-2 bg-secondary rounded-lg">
                      You
                    </div>
                  </div>
                  <div className="flex justify-between">
                    <div className="text-center">
                      <div className="text-sm text-muted-foreground">Score</div>
                      <div className="text-lg font-semibold">{playerScores[playerId] || 0}</div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  // Show waiting/countdown view when in waiting or countdown state
  if (status === 'waiting' || status === 'countdown') {
    return (
      <div className="flex min-h-screen flex-col bg-background font-sans antialiased">
        <Header subtitle="Race Mode" />
        <main className="flex flex-1 flex-col items-center justify-center p-4 sm:p-6 md:p-8 lg:py-12">
          <div className="w-full max-w-2xl">
            <Card className="border border-gray-700">
              <CardHeader className="text-center">
                <CardTitle className="text-2xl sm:text-3xl sr-only">Race Mode</CardTitle>
                <CardDescription>
                  Room Code: <span className="font-mono font-bold">{roomCode}</span>
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <p className="text-lg">
                    {status === 'waiting' 
                      ? `Waiting for another player... (${players.length}/2)` 
                      : 'Starting in'}
                  </p>
                  
                  <div className="min-h-[120px] flex items-center justify-center">
                    {status === 'countdown' && countdownRemaining !== null && countdownRemaining !== undefined ? (
                      <CountdownTimer 
                        remainingTime={countdownRemaining} 
                        onComplete={() => {
                          // When countdown completes, game starts automatically
                        }} 
                      />
                    ) : (
                      <div className="text-6xl font-bold text-primary transition-opacity duration-100">--</div>
                    )}
                  </div>
                  
                  {/* Consistent UI elements to prevent shuffling */}
                  <div className="space-y-2">
                    <div className="flex justify-between min-h-[50px] items-center">
                      {players.map((player) => (
                        <div key={player} className="px-4 py-2 bg-secondary rounded-lg">
                          {player === playerId ? 'You' : 'Opponent'}
                        </div>
                      ))}
                    </div>
                    {/* Score display for both players */}
                    <div className="flex justify-between">
                      {players.map((player) => (
                        <div 
                          key={`score-${player}`} 
                          className="text-center"
                        >
                          <div className="text-sm text-muted-foreground">Score</div>
                          <div className="text-lg font-semibold">{playerScores[player] || 0}</div>
                        </div>
                      ))}
                    </div>
                    <div className="flex justify-center">
                      <Button variant="outline" onClick={handleLeaveRoom}>
                        Leave Room
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  // Game view when in progress
  if (status === 'in-progress') {
    return (
      <div className="flex min-h-screen flex-col bg-background font-sans antialiased">
        <Header subtitle="Race Mode" />
        <main className="flex flex-1 flex-col items-center justify-center p-4 sm:p-6 md:p-8 lg:py-12">
          <div className="w-full max-w-2xl">
            <Card className="border border-gray-700">
              <CardHeader className="text-center">
                <CardTitle className="text-2xl sm:text-3xl sr-only">Race Mode</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {gameOver ? (
                  <div className="text-center py-8">
                    <h3 className="text-2xl font-bold mb-4">Game Over!</h3>
                    <p className="text-lg mb-6">
                      {playerStats.completed 
                        ? `You completed the word!` 
                        : 'Game\'s up!'}
                    </p>
                    <Button onClick={handleLeaveRoom}>Back to Lobby</Button>
                  </div>
                ) : (
                  <>
                    {/* Consistent player display area to prevent shuffling */}
                    <div className="flex justify-between min-h-[50px] items-center">
                      {players.map((player) => (
                        <div 
                          key={player} 
                          className={`px-4 py-2 rounded-lg ${
                            player === localStorage.getItem('player-id') 
                              ? 'bg-primary text-primary-foreground' 
                              : 'bg-secondary'
                          }`}
                        >
                          {player === localStorage.getItem('player-id') ? 'You' : 'Opponent'}
                        </div>
                      ))}
                    </div>
                    {/* Score display for both players */}
                    <div className="flex justify-between">
                      {players.map((player) => (
                        <div 
                          key={`score-${player}`} 
                          className="text-center"
                        >
                          <div className="text-sm text-muted-foreground">Score</div>
                          <div className="text-lg font-semibold">{playerScores[player] || 0}</div>
                        </div>
                      ))}
                    </div>
                    
                    <div className="flex flex-col items-center gap-6">
                      <div className="w-full max-w-md">
                        <WordleGrid 
                          board={board} 
                          currentRow={currentRow} 
                          currentCol={currentCol} 
                          revealed={revealed} 
                        />
                      </div>
                      <div className="w-full">
                        <Keyboard onKeyPress={handleKeyPress} usedKeys={usedKeys} />
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  // Fallback
  return (
    <div className="flex min-h-screen flex-col bg-background font-sans antialiased">
      <Header subtitle="Race Mode" />
      <main className="flex flex-1 flex-col items-center justify-center p-4 sm:p-6 md:p-8 lg:py-12">
        <div className="w-full max-w-2xl">
          <Card className="border border-gray-700">
            <CardHeader className="text-center">
              <CardTitle className="text-2xl sm:text-3xl sr-only">Race Mode</CardTitle>
              <CardDescription>
                Room Code: <span className="font-mono font-bold">{roomCode}</span>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <p>Connecting to room...</p>
                {/* Placeholder for player indicators and scores during connection */}
                <div className="flex justify-between min-h-[50px] items-center">
                  <div className="px-4 py-2 bg-secondary rounded-lg">
                    You
                  </div>
                </div>
                <div className="flex justify-between">
                  <div className="text-center">
                    <div className="text-sm text-muted-foreground">Score</div>
                    <div className="text-lg font-semibold">{playerScores[playerId] || 0}</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
      <Footer />
    </div>
  );
}