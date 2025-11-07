'use client';

import { useState, useEffect, useRef } from 'react';
import { CountdownTimer } from '@/components/countdown-timer';
import { Header } from '@/components/header';
import { Footer } from '@/components/footer';
import { toast } from 'sonner';
import { MAX_ATTEMPTS, WORD_LENGTH } from '@/components/constants';
import { isValidWord, getRandomWords } from '@/lib/word-utils';
import Keyboard from '@/components/keyboard';
import WordleGrid from '@/components/wordle-grid';
import { Clock, RotateCcw } from 'lucide-react';

export default function TimeLimitPage() {
  const [targetWord, setTargetWord] = useState('');
  const [board, setBoard] = useState<string[][]>(Array(MAX_ATTEMPTS).fill(null).map(() => Array(WORD_LENGTH).fill('')));
  const [currentRow, setCurrentRow] = useState(0);
  const [currentCol, setCurrentCol] = useState(0);
  const [score, setScore] = useState(0); // Track completed words
  const [gameStatus, setGameStatus] = useState<'playing' | 'won' | 'lost' | 'time-up'>('playing');
  const [remainingTime, setRemainingTime] = useState(120000); // 2 minutes in milliseconds
  const [timeUpHandled, setTimeUpHandled] = useState(false);
  const [timerStarted, setTimerStarted] = useState(false); // New state to track if timer has started
  const [shouldStartTimer, setShouldStartTimer] = useState(false); // Flag to trigger timer start
  const [revealed, setRevealed] = useState<boolean[][]>(Array(MAX_ATTEMPTS).fill(null).map(() => Array(WORD_LENGTH).fill(false)));
  const [usedKeys, setUsedKeys] = useState<Record<string, 'correct' | 'present' | 'absent'>>({});

  // Use ref to store timer ID to properly clear it
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const restartButtonRef = useRef<HTMLButtonElement>(null);

  // Add keyboard event listener for physical keyboard support
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (gameStatus !== 'playing' || currentRow >= MAX_ATTEMPTS) return;

      const key = event.key.toUpperCase();

      // Handle Enter key
      if (key === 'ENTER' || key === 'RETURN') {
        event.preventDefault();
        handleKeyPress('ENTER');
      } 
      // Handle Backspace key
      else if (key === 'BACKSPACE') {
        event.preventDefault();
        handleKeyPress('BACKSPACE');
      } 
      // Handle letter keys
      else if (key.length === 1 && /^[A-Z]$/i.test(key)) { // Only letter keys
        event.preventDefault();
        handleKeyPress(key);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [gameStatus, currentRow, currentCol, targetWord, board, revealed, usedKeys]);

  // Initialize the game
  useEffect(() => {
    const initializeGame = async () => {
      try {
        const words = await getRandomWords(1);
        const word = words[0];
        setTargetWord(word.toUpperCase());
      } catch (error) {
        console.error('Error initializing game:', error);
        toast.error('Failed to initialize game. Please try again.');
      }
    };

    initializeGame();
  }, []);

  // Handle timer countdown - only start after first valid guess
  useEffect(() => {
    // Clear any existing timer when dependencies change
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    // Only set up timer if all conditions are met
    if (gameStatus === 'playing' && !timeUpHandled && timerStarted && remainingTime > 0) {
      timerRef.current = setInterval(() => {
        setRemainingTime(prev => {
          const newTime = Math.max(0, prev - 100); // Ensure it doesn't go below 0
          if (newTime <= 0) {
            handleTimeUp();
          }
          return newTime;
        });
      }, 100);
    }

    // Cleanup interval on unmount or when dependencies change
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [gameStatus, timeUpHandled, timerStarted]); // Don't include remainingTime in deps to avoid constant restarts

  const handleTimeUp = () => {
    if (!timeUpHandled) {
      setGameStatus('time-up');
      setTimeUpHandled(true);
      toast.info('Time is up!', {
        description: `Game over! You solved ${score} words.`,
      });
    }
  };

  const handleKeyPress = async (key: string) => {
    if (gameStatus !== 'playing' || currentRow >= MAX_ATTEMPTS) return;

    if (key === 'ENTER') {
      await submitGuess();
    } else if (key === 'BACKSPACE') {
      if (currentCol > 0) {
        const newBoard = [...board];
        newBoard[currentRow][currentCol - 1] = '';
        setBoard(newBoard);
        setCurrentCol(prev => Math.max(0, prev - 1));
      }
    } else if (key.match(/^[A-Z]$/)) {
      if (currentCol < WORD_LENGTH) {
        const newBoard = [...board];
        newBoard[currentRow][currentCol] = key;
        setBoard(newBoard);
        setCurrentCol(prev => prev + 1);
      }
    }
  };

  const submitGuess = async () => {
    if (currentCol !== WORD_LENGTH) {
      toast.error('Not enough letters');
      return;
    }

    const currentWord = board[currentRow].join('').toLowerCase();
    
    try {
      if (!await isValidWord(currentWord)) {
        toast.error('Not in word list');
        return;
      }

      // Start the timer on the first valid guess
      if (!timerStarted) {
        setTimerStarted(true);
        setShouldStartTimer(true); // This will trigger the timer to start
      }

      // Update revealed status for the current row
      const newRevealed = [...revealed];
      newRevealed[currentRow] = Array(WORD_LENGTH).fill(true);
      setRevealed(newRevealed);

      // Update keyboard status
      const wordStatuses = getLetterStatuses(currentWord.toUpperCase(), targetWord);
      const newUsedKeys = { ...usedKeys };
      for (let i = 0; i < WORD_LENGTH; i++) {
        const letter = currentWord[i].toUpperCase();
        const status = wordStatuses[i];
        
        if (!newUsedKeys[letter] || 
            (newUsedKeys[letter] === 'absent' && status !== 'absent') ||
            (newUsedKeys[letter] === 'present' && status === 'correct')) {
          newUsedKeys[letter] = status;
        }
      }
      setUsedKeys(newUsedKeys);

      if (currentWord.toUpperCase() === targetWord) {
        // Player completed the word successfully
        setScore(prev => prev + 1);
        toast.success('Word completed!', {
          description: `You solved: ${targetWord}`,
        });
        
        // Move to the next word immediately
        await loadNextWord();
      } else if (currentRow === MAX_ATTEMPTS - 1) {
        // Player used all attempts
        toast.error('No more guesses', {
          description: `The word was: ${targetWord}`,
        });
        
        // Move to the next word immediately
        await loadNextWord();
      } else {
        // Move to next row
        setCurrentRow(prev => prev + 1);
        setCurrentCol(0);
      }
    } catch (error) {
      console.error('Error validating guess:', error);
      toast.error('Error validating your guess. Please try again.');
    }
  };

  // Load the next word after completing the current one
  const loadNextWord = async () => {
    try {
      const words = await getRandomWords(1);
      const word = words[0];
      setTargetWord(word.toUpperCase());
      // Reset board and game state for new word
      setBoard(Array(MAX_ATTEMPTS).fill(null).map(() => Array(WORD_LENGTH).fill('')));
      setCurrentRow(0);
      setCurrentCol(0);
      setRevealed(Array(MAX_ATTEMPTS).fill(null).map(() => Array(WORD_LENGTH).fill(false)));
      // Keep used keys to show progress across words
    } catch (error) {
      console.error('Error loading next word:', error);
      toast.error('Failed to load next word. Please try again.');
    }
  };

  // Compare a guess to the solution and return status for each letter
  // Returns an array of statuses: 'correct', 'present', 'absent'
  function getLetterStatuses(guess: string, solution: string): ('correct' | 'present' | 'absent')[] {
    const result: ('correct' | 'present' | 'absent')[] = Array(5).fill('absent');
    const solutionLetters = solution.split('');
    const guessLetters = guess.split('');

    // First pass: mark correct letters
    for (let i = 0; i < 5; i++) {
      if (guessLetters[i] === solutionLetters[i]) {
        result[i] = 'correct';
        // Mark this letter in solution as used
        solutionLetters[i] = '';
      }
    }

    // Second pass: mark present letters
    for (let i = 0; i < 5; i++) {
      if (result[i] !== 'correct') {
        const letterIndex = solutionLetters.indexOf(guessLetters[i]);
        if (letterIndex !== -1) {
          result[i] = 'present';
          // Mark this letter in solution as used
          solutionLetters[letterIndex] = '';
        }
      }
    }

    return result;
  }

  const resetGame = async () => {
    // Clear any existing timer BEFORE resetting state
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    
    try {
      // Get a new word
      const words = await getRandomWords(1);
      const word = words[0];
      
      // Reset game state - using a functional approach to ensure proper sequence
      setTargetWord(word.toUpperCase());
      setBoard(Array(MAX_ATTEMPTS).fill(null).map(() => Array(WORD_LENGTH).fill('')));
      setCurrentRow(0);
      setCurrentCol(0);
      setScore(0); // Reset score
      setGameStatus('playing');
      setTimeUpHandled(false);
      setTimerStarted(false); // Reset timer started state
      setShouldStartTimer(false); // Reset timer start flag
      setRevealed(Array(MAX_ATTEMPTS).fill(null).map(() => Array(WORD_LENGTH).fill(false)));
      setUsedKeys({});
      // Most importantly, reset remaining time to full 2 minutes AFTER clearing timer
      setRemainingTime(120000); // Reset to 2 minutes
      
      // Remove focus from the restart button to prevent keyboard issues
      if (restartButtonRef.current) {
        restartButtonRef.current.blur();
      }
    } catch (error) {
      console.error('Error resetting game:', error);
      toast.error('Failed to reset game. Please try again.');
    }
  };



  return (
    <div className="flex min-h-screen flex-col bg-background font-sans antialiased">
      <Header />
      <main className="flex flex-1 flex-col items-center justify-center p-4 sm:p-4 md:p-4 lg:py-4">
        <div className="w-full max-w-4xl">
          {/* Responsive layout: side-by-side on desktop, stacked on mobile */}
          <div className="flex flex-col md:flex-row gap-6 h-full">
            {/* Left column: Game info (score, timer, restart) */}
            <div className="md:w-1/3 flex flex-col justify-center">
              <div className="flex flex-col gap-4 w-full">
                {/* Score and timer on one line */}
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">Score</span>
                    <span className="text-lg font-bold">{score}</span>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    <CountdownTimer 
                      remainingTime={remainingTime} 
                      onComplete={handleTimeUp} 
                      timerStarted={timerStarted}
                      showInMinutes={true}
                    />
                  </div>
                </div>
                
                <div className="flex justify-center">
                  <button
                    ref={restartButtonRef}
                    onClick={resetGame}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-md transition-colors"
                  >
                    <RotateCcw className="h-4 w-4" />
                    Restart
                  </button>
                </div>
              </div>
            </div>
            
            {/* Right column: Wordle grid and keyboard */}
            <div className="md:w-2/3 flex flex-col gap-4">
              {/* Word grid using the WordleGrid component */}
              <WordleGrid 
                board={board}
                currentRow={currentRow}
                currentCol={currentCol}
                revealed={revealed.map((row, i) => 
                  row.map((isRevealed, j) => {
                    if (isRevealed && targetWord) {
                      const statuses = getLetterStatuses(board[i].join('').toUpperCase(), targetWord);
                      return statuses[j];
                    }
                    return isRevealed;
                  })
                )}
                solution={targetWord}
              />

              {/* Keyboard */}
              <Keyboard 
                usedKeys={usedKeys} 
                onKeyPress={(key) => {
                  if (gameStatus === 'playing') {
                    handleKeyPress(key);
                  }
                }}
              />
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}