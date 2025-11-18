'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { useRoom } from '@/components/room-provider';

import WordleGrid from '@/components/wordle-grid';
import Keyboard from '@/components/keyboard';
import { toast } from 'sonner';
import { getLetterStatuses, getRandomWords, getWordLists, isValidWord } from '@/lib/word-utils';

export default function RaceRoomPage() {
  const params = useParams();
  const roomCode = params.id as string;
  const router = useRouter();
  const { 
    status, 
    players, 
    scores,
    words: sharedWords, // Get shared words from room provider
    gameOver: roomGameOver, // Get game over status from room provider
    winner: roomWinner, // Get winner from room provider
    countdownRemaining, 
    getRoomInfo, 
    leaveRoom
  } = useRoom();
  const [isJoining, setIsJoining] = useState(true); // Set to true initially since we're trying to join
  const [initialLoad, setInitialLoad] = useState(true);
  // Track if we've seen the first status update from SSE to prevent flickering
  const [hasReceivedStatusUpdate, setHasReceivedStatusUpdate] = useState(false);
  const WORD_LENGTH = 5;
  const MAX_ATTEMPTS = 6;
  
  // Refs for values that shouldn't trigger re-runs of effects
  const statusRef = useRef(status);
  useEffect(() => {
    statusRef.current = status;
  }, [status]);
  
  // Initialize the board
  const initialBoard = Array(MAX_ATTEMPTS).fill(null).map(() => 
    Array(WORD_LENGTH).fill('')
  );
  
  const [board, setBoard] = useState<string[][]>(initialBoard);
  const [currentRow, setCurrentRow] = useState<number>(0);
  const [currentCol, setCurrentCol] = useState<number>(0);
  const [revealed, setRevealed] = useState<(boolean | 'correct' | 'present' | 'absent')[][]>(
    Array(MAX_ATTEMPTS).fill(null).map(() => Array(WORD_LENGTH).fill(false))
  );
  const [usedKeys, setUsedKeys] = useState<Record<string, string>>({});

  const [gameOver, setGameOver] = useState(false); // Local game over state

  
  // Game state
  const [currentWordIndex, setCurrentWordIndex] = useState(0);
  const [words, setWords] = useState<string[]>([]); // The 20 shared words
  const [gameInitialized, setGameInitialized] = useState(false); // Track if game is properly initialized
  const [gameReady, setGameReady] = useState(false); // Track if game words are loaded and ready

  const [validWords, setValidWords] = useState<string[]>([]);
  const [wordleWords, setWordleWords] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  

  // Update local game over state based on room state
  useEffect(() => {
    if (roomGameOver && !gameOver) {
      setGameOver(true);
    }
  }, [roomGameOver, gameOver]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update game initialization status
  useEffect(() => {
    const shouldInitialize = status === 'in-progress' && words.length > 0 && players.length > 0;
    if (shouldInitialize !== gameInitialized) {
      setGameInitialized(shouldInitialize);
    }
  }, [status, words, players, gameInitialized]); // eslint-disable-line react-hooks/exhaustive-deps


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
    let isCancelled = false; // Flag to track if component is unmounting
    
    if (roomCode && playerId && !isCancelled) {
      // Set loading states using functional updates to prevent race conditions
      setIsJoining(prev => prev !== true ? true : prev);
      setInitialLoad(prev => prev !== true ? true : prev);
      console.log('Attempting to connect to room:', roomCode);
      // Try to get room info (this will work for both joining and if user is already in the room)
      getRoomInfo(roomCode, playerId).then((success) => {
        if (!isCancelled && !success) {
          // If getting room info failed, it might be because we need to join
          // setError('Room does not exist or you do not have access to it.'); // Removed unused error state
          setIsJoining(prev => prev !== false ? false : prev);
          setInitialLoad(prev => prev !== false ? false : prev);
        } else if (!isCancelled) {
          setIsJoining(prev => prev !== false ? false : prev);
          setInitialLoad(prev => prev !== false ? false : prev);
          console.log('Successfully connected to room:', roomCode, 'Status:', statusRef.current);
        }
      }).catch((error) => {
        if (!isCancelled) {
          // Check if the error is because player is not in the room or room was not found
          if (error.message && (error.message.includes('Room not found') || error.message.includes('Player not in this room'))) {
            // Don't show an error in this case, as it might be after the room has ended
            console.log('Room not found or player not in room - possible after leaving room or game ended');
          } else {
            console.error('Error connecting to room:', error);
            // setError('Failed to connect to room. Please try again.'); // Removed unused error state
          }
          setIsJoining(prev => prev !== false ? false : prev);
          setInitialLoad(prev => prev !== false ? false : prev);
        }
      });
    }
    
    // Cleanup function to set the flag when component unmounts
    return () => {
      isCancelled = true;
    };
  }, [roomCode, playerId, getRoomInfo]); // Removed status, isJoining, initialLoad from dependency array to avoid infinite loop // eslint-disable-line react-hooks/exhaustive-deps



  // Initialize game words during countdown phase to prevent race condition - use shared words from room
  useEffect(() => {
    // Start initializing game words as soon as we have players and are either in countdown or in-progress
    if ((status === 'countdown' || status === 'in-progress') && players.length > 0) {
      // If no words have been generated yet, generate them and store in the room
      if (sharedWords.length === 0) {
        const generateAndStoreWords = async () => {
          // Only the first player or a designated player should generate words
          if (players[0] === playerId) { // Let the first player in the room generate words
            const newWords = await getRandomWords(20);

            // Store the words in the room via API endpoint
            if (roomCode) {
              try {
                const response = await fetch('/api/room/words', {
                  method: 'PUT',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    roomCode,
                    playerId,
                    words: newWords
                  }),
                });

                if (!response.ok) {
                  console.error('Failed to store words in room');
                }
              } catch (error) {
                console.error('Error storing words:', error);
              }
            }
          }
        };

        generateAndStoreWords();
      } else if (JSON.stringify(sharedWords) !== JSON.stringify(words)) {
        // Use the shared words from the room provider
        setWords(sharedWords);
        // Mark game as ready when words are loaded
        if (sharedWords.length > 0) {
          setGameReady(true);
        }
      } // eslint-disable-line react-hooks/exhaustive-deps

      // Load valid words for validation if not already loaded
      if (validWords.length === 0 || wordleWords.length === 0) {
        getWordLists().then(wordLists => {
          setValidWords(wordLists.validWords);
          setWordleWords(wordLists.wordleWords);
        });
      }
    }

    // Also set game ready when we have words and they're properly loaded
    if (status === 'in-progress' && words.length > 0) {
      setGameReady(true);
    }
  }, [status, players, sharedWords, validWords.length, wordleWords.length, playerId, roomCode, words]);

  // Track when we first receive a non-default status from SSE to prevent flickering
  useEffect(() => {
    // Only set hasReceivedStatusUpdate to true if the status is not the initial default
    if (status !== 'none' && !hasReceivedStatusUpdate) {
      setHasReceivedStatusUpdate(true);
    }
  }, [status, hasReceivedStatusUpdate]); // eslint-disable-line react-hooks/exhaustive-deps



  // Update player score by sending to backend
  const updatePlayerScore = useCallback(async (playerId: string, points: number) => {
    if (!roomCode) return;
    
    try {
      const response = await fetch('/api/room/score', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          roomCode, 
          playerId, 
          points 
        }),
      });

      if (!response.ok) {
        console.error('Failed to update score on server');
      }
    } catch (error) {
      console.error('Error updating score:', error);
    }
  }, [roomCode]);

  // Helper function to reset for a new word
  const resetCurrentRow = useCallback(() => {
    const newBoard = [...board];
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      for (let j = 0; j < WORD_LENGTH; j++) {
        newBoard[i][j] = '';
      }
    }
    setBoard(newBoard);
    setRevealed(Array(MAX_ATTEMPTS).fill(null).map(() => Array(WORD_LENGTH).fill(false)));
    setCurrentRow(0);
    setCurrentCol(0);
    setUsedKeys({});
  }, [board, MAX_ATTEMPTS, WORD_LENGTH]);

  // Handle keyboard input for the Wordle grid
  const handleKeyPress = useCallback(async (key: string) => {
    if (gameOver || status !== 'in-progress' || isSubmitting || !gameReady) return;
    
    if (key === 'Enter') {
      if (currentCol !== WORD_LENGTH) {
        // Row is not complete
        return;
      }
      
      setIsSubmitting(true);
      try {
        // Get the current word
        const currentWord = board[currentRow].join('').toLowerCase();
        
        // Check if the word is valid
        const isValid = await isValidWord(currentWord);
        if (!isValid) {
          // Show toast notification for invalid word
          toast.error('INVALID WORD', {
            description: 'TRY AGAIN',
          });
          return;
        }
        
        // Check against the solution and get letter statuses
        // Check if game is properly initialized before processing
        if (!words || words.length === 0 || currentWordIndex >= words.length || currentWordIndex < 0) {
          console.error(`Game not properly initialized: words length = ${words?.length || 0}, currentWordIndex = ${currentWordIndex}`);
          return; // Exit early if game isn't properly initialized
        }
        
        const solution = words[currentWordIndex];
        // Add safety check to ensure solution exists before processing
        if (!solution) {
          console.error(`No solution found for word index ${currentWordIndex}, available words: ${words.length}`);
          return; // Exit early if solution doesn't exist yet
        }
        
        const letterStatuses = getLetterStatuses(currentWord, solution);
        
        // Mark this row as revealed with proper statuses
        const newRevealed = [...revealed];
        newRevealed[currentRow] = [...letterStatuses];
        setRevealed(newRevealed);
        
        // Update key statuses based on the solution
        const newUsedKeys = {...usedKeys};
        board[currentRow].forEach((letter, index) => {
          if (letter) {
            const status = letterStatuses[index];
            if (status) {  // Ensure status exists before processing
              // Only update status if it's better than the current one
              if (!newUsedKeys[letter] || 
                  (newUsedKeys[letter] === 'absent' && status !== 'absent') ||
                  (newUsedKeys[letter] === 'present' && status === 'correct')) {
                newUsedKeys[letter] = status;
              }
            }
          }
        });
        setUsedKeys(newUsedKeys);
        
        // Check if the word was guessed correctly
        if (currentWord === solution.toLowerCase()) {
          // Calculate what the new score should be based on current state for win condition check
          const currentScore = (scores[playerId] || 0) + 1;
          
          // Update player's score on backend
          await updatePlayerScore(playerId, 1);
          
          if (currentScore >= 5) {
            // Set game over state in the room
            if (roomCode) {
              try {
                await fetch('/api/room/gameover', {
                  method: 'PUT',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({ 
                    roomCode, 
                    playerId,
                    winner: playerId
                  }),
                });
              } catch (error) {
                console.error('Error setting game over:', error);
              }
            }
          } else {
            // Show success notification
            toast.success('CORRECT!', {
              description: solution.toUpperCase(),
            });
            
            // Move to next word
            if (currentWordIndex < words.length - 1) {
              setCurrentWordIndex(currentWordIndex + 1);
              // Reset for the new word
              resetCurrentRow();
            } else {
              // Game is over, all words have been completed
              // This shouldn't happen in normal gameplay since it's a race to 5 points
              // But if all words are done before anyone reaches 5, set game over
              if (roomCode) {
                try {
                  await fetch('/api/room/gameover', {
                    method: 'PUT',
                    headers: {
                      'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ 
                      roomCode, 
                      playerId,
                      winner: null // No winner if time runs out
                    }),
                  });
                } catch (error) {
                  console.error('Error setting game over:', error);
                }
              }
            }
          }
        } else if (currentRow === MAX_ATTEMPTS - 1) {
          // Player has used all attempts for this word
          if (solution) {
            toast.error('THE WORD WAS', {
              description: solution.toUpperCase(),
            });
          }
          
          // Move to next word
          if (currentWordIndex < words.length - 1) {
            setCurrentWordIndex(currentWordIndex + 1);
            // Reset for the new word
            resetCurrentRow();
          } else {
            // Game is over, all words attempted
            // This shouldn't happen in normal gameplay since it's a race to 5 points
            // But if all words are done before anyone reaches 5, set game over
            if (roomCode) {
              try {
                await fetch('/api/room/gameover', {
                  method: 'PUT',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({ 
                    roomCode, 
                    playerId,
                    winner: null // No winner if time runs out
                  }),
                });
              } catch (error) {
                console.error('Error setting game over:', error);
              }
            }
          }
        } else {
          // Move to next row
          setCurrentRow(currentRow + 1);
          setCurrentCol(0);
        }
      } finally {
        setIsSubmitting(false);
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
  }, [gameOver, status, WORD_LENGTH, MAX_ATTEMPTS, board, currentRow, currentCol, words, currentWordIndex, scores, playerId, roomCode, revealed, usedKeys, updatePlayerScore, resetCurrentRow, isSubmitting]);

  // Handle physical keyboard events
  useEffect(() => {
    if (status !== 'in-progress' || gameOver || !gameReady) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isSubmitting) return;

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
  }, [currentRow, currentCol, gameOver, status, gameReady, handleKeyPress, isSubmitting]);

  const handleLeaveRoom = () => {
    leaveRoom();
    router.push('/race');
  };

  // Wait until we've received the first status update to prevent flickering
  if (!hasReceivedStatusUpdate) {
    const handleCancel = () => {
      leaveRoom();
      router.push('/race');
    };

    return (
      <div className="flex min-h-screen flex-col bg-background font-sans antialiased">
        <Header subtitle="Race Mode" />
        <main className="flex flex-1 flex-col items-center justify-center p-4 sm:p-4 md:p-4 lg:py-4">
          <div className="w-full max-w-2xl">
            <Card className="border border-gray-700">
              <CardHeader className="text-center">
                <CardTitle className="text-2xl sm:text-3xl sr-only">Race Mode</CardTitle>
                <CardDescription>
                  Room: <span className="font-mono font-bold">{roomCode}</span>
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="text-center">
                  <p>Establishing connection...</p>
                  {/* Placeholder for player indicators and scores during loading */}
                  <div className="flex flex-col items-center space-y-1">
                    <div className="px-4 py-2 bg-secondary rounded-lg">
                      You
                    </div>
                    <div className="text-center">
                      <div className="text-sm text-muted-foreground">Score</div>
                      <div className="text-lg font-semibold">{scores[playerId] || 0}</div>
                    </div>
                  </div>
                  <div className="pt-4">
                    <Button variant="outline" onClick={handleCancel}>
                      Cancel
                    </Button>
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
        <main className="flex flex-1 flex-col items-center justify-center p-4 sm:p-4 md:p-4 lg:py-4">
          <div className="w-full max-w-2xl">
            <Card className="border border-gray-700">
              <CardHeader className="text-center">
                <CardTitle className="text-2xl sm:text-3xl sr-only">Race Mode</CardTitle>
                <CardDescription className="text-4xl sm:text-5xl font-mono font-bold">
                  {roomCode}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="text-center">
                  <div className="mb-4 min-h-[120px] flex items-center justify-center">
                    {status === 'countdown' ? (
                      <div className="text-3xl sm:text-4xl font-bold text-primary transition-opacity duration-300">
                        {Math.ceil((countdownRemaining || 10000) / 1000)}
                      </div>
                    ) : (
                      <div className="text-6xl font-bold text-primary transition-opacity duration-100"></div>
                    )}
                  </div>

                  {/* Consistent UI elements to prevent shuffling */}
                  <div className="space-y-4">
                    <div className="flex justify-between min-h-[50px] items-center">
                      {players.map((player) => (
                        <div key={player} className="flex flex-col items-center space-y-1">
                          <div className="px-4 py-2 bg-secondary rounded-lg">
                            {player === playerId ? 'You' : 'Opponent'}
                          </div>
                          {/* Score display for each player */}
                          <div className="text-center">
                            <div className="text-sm text-muted-foreground">Score</div>
                            <div className="text-lg font-semibold">{scores[player] || 0}</div>
                          </div>
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
        <main className="flex flex-1 flex-col items-center justify-center p-4 sm:p-4 md:p-4 lg:py-4">
          {gameOver ? (
            <div className="w-full max-w-2xl">
              <Card className="border border-gray-700">
                <CardContent className="space-y-6">
                  <div className="text-center py-8">
                    {roomWinner === playerId || (!roomWinner && scores[playerId] >= 5) ? (
                      <>
                        <h3 className="text-2xl font-bold mb-2">You Won!</h3>
                        <p className="text-lg mb-6">You reached 5 points first</p>
                      </>
                    ) : (
                      <>
                        <h3 className="text-2xl font-bold mb-2">You Lost!</h3>
                        <p className="text-lg mb-6">Opponent reached 5 points first</p>
                      </>
                    )}
                    <Button onClick={handleLeaveRoom}>Return to Lobby</Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <div className="w-full max-w-4xl">
              <div className="flex flex-col lg:flex-row gap-6 lg:gap-8 w-full h-full">
                {/* Left column: Player info and scores */}
                <div className="lg:w-1/3 flex justify-center items-center">
                  <div className="max-w-xs w-full">
                    <div className="flex justify-between">
                      {players.map((player) => (
                        <div 
                          key={player} 
                          className="flex flex-col items-center space-y-1"
                        >
                          <div 
                            className={`px-4 py-2 rounded-lg ${
                              player === localStorage.getItem('player-id') 
                                ? 'bg-primary text-primary-foreground' 
                                : 'bg-secondary'
                            }`}
                          >
                            {player === localStorage.getItem('player-id') ? 'You' : 'Opponent'}
                          </div>
                          {/* Score display for each player */}
                          <div className="text-center">
                            <div className="text-sm text-muted-foreground">Score</div>
                            <div className="text-lg font-semibold">{scores[player] || 0}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                
                {/* Right column: Game grid and keyboard */}
                <div className="lg:w-2/3 flex justify-center items-center">
                  <div className="w-full max-w-md flex flex-col items-center">
                    <div className="w-full -mt-2">
                      <WordleGrid 
                        board={board} 
                        currentRow={currentRow} 
                        currentCol={currentCol} 
                        revealed={revealed} 
                        solution={words[currentWordIndex]}
                      />
                    </div>
                    <div className="w-full mt-2">
                      <Keyboard onKeyPress={handleKeyPress} usedKeys={usedKeys} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
        <Footer />
      </div>
    );
  }

  // Fallback
  return (
    <div className="flex min-h-screen flex-col bg-background font-sans antialiased">
      <Header subtitle="Race Mode" />
      <main className="flex flex-1 flex-col items-center justify-center p-4 sm:p-4 md:p-4 lg:py-4">
        <div className="w-full max-w-2xl">
          <Card className="border border-gray-700">
            <CardHeader className="text-center">
              <CardTitle className="text-2xl sm:text-3xl sr-only">Race Mode</CardTitle>
              <CardDescription>
                Room Code: <span className="font-mono font-bold">{roomCode}</span>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="text-center">
                <p>Connecting to room...</p>
                {/* Placeholder for player indicators and scores during connection */}
                <div className="flex flex-col items-center space-y-1">
                  <div className="px-4 py-2 bg-secondary rounded-lg">
                    You
                  </div>
                  <div className="text-center">
                    <div className="text-sm text-muted-foreground">Score</div>
                    <div className="text-lg font-semibold">{scores[playerId] || 0}</div>
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