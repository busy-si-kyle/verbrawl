'use client';

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CountdownTimer } from '@/components/countdown-timer';
import { Header } from '@/components/header';
import { Footer } from '@/components/footer';
import { toast } from 'sonner';
import { MAX_ATTEMPTS, WORD_LENGTH } from '@/components/constants';
import { isValidWord, getRandomWords } from '@/lib/word-utils';
import { Check, RotateCcw, Clock } from 'lucide-react';

export default function TimeLimitPage() {
  const [targetWord, setTargetWord] = useState('');
  const [guesses, setGuesses] = useState<string[]>(Array(MAX_ATTEMPTS).fill(''));
  const [currentGuess, setCurrentGuess] = useState('');
  const [currentAttempt, setCurrentAttempt] = useState(0);
  const [gameStatus, setGameStatus] = useState<'playing' | 'won' | 'lost' | 'time-up'>('playing');
  const [remainingTime, setRemainingTime] = useState(120000); // 2 minutes in milliseconds
  const [timeUpHandled, setTimeUpHandled] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

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

  // Handle timer countdown
  useEffect(() => {
    let timer: NodeJS.Timeout;
    
    if (gameStatus === 'playing' && remainingTime > 0 && !timeUpHandled) {
      timer = setTimeout(() => {
        setRemainingTime(prev => {
          const newTime = prev - 100;
          if (newTime <= 0) {
            handleTimeUp();
            return 0;
          }
          return newTime;
        });
      }, 100);
    }

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [gameStatus, remainingTime, timeUpHandled]);

  const handleTimeUp = () => {
    if (!timeUpHandled) {
      setGameStatus('time-up');
      setTimeUpHandled(true);
      toast.info('Time is up!', {
        description: 'You ran out of time. Game over!',
      });
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.toUpperCase();
    if (value.length <= WORD_LENGTH) {
      setCurrentGuess(value);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      submitGuess();
    } else if (e.key === 'Backspace' && currentGuess.length === 0 && currentAttempt > 0) {
      // Allow going back to previous guess if current guess is empty
      setCurrentAttempt(prev => Math.max(0, prev - 1));
      const prevGuess = guesses[currentAttempt - 1] || '';
      setCurrentGuess(prevGuess);
    }
  };

  const submitGuess = async () => {
    if (currentGuess.length !== WORD_LENGTH) {
      toast.error('Word must be 5 letters long');
      return;
    }

    try {
      if (!await isValidWord(currentGuess)) {
        toast.error(`${currentGuess} is not a valid word`);
        return;
      }

      const newGuesses = [...guesses];
      newGuesses[currentAttempt] = currentGuess;
      setGuesses(newGuesses);

      if (currentGuess === targetWord) {
        setGameStatus('won');
        toast.success('Congratulations!', {
          description: `You solved the word: ${targetWord}`,
        });
      } else if (currentAttempt === MAX_ATTEMPTS - 1) {
        setGameStatus('lost');
        toast.error('Game over!', {
          description: `The word was: ${targetWord}`,
        });
      } else {
        setCurrentAttempt(prev => prev + 1);
        setCurrentGuess('');
      }
    } catch (error) {
      console.error('Error validating guess:', error);
      toast.error('Error validating your guess. Please try again.');
    }
  };

  const resetGame = async () => {
    try {
      const words = await getRandomWords(1);
      const word = words[0];
      setTargetWord(word.toUpperCase());
      setGuesses(Array(MAX_ATTEMPTS).fill(''));
      setCurrentGuess('');
      setCurrentAttempt(0);
      setGameStatus('playing');
      setRemainingTime(120000); // Reset to 2 minutes
      setTimeUpHandled(false);
      if (inputRef.current) {
        inputRef.current.focus();
      }
    } catch (error) {
      console.error('Error resetting game:', error);
      toast.error('Failed to reset game. Please try again.');
    }
  };

  const getTileColor = (guess: string, position: number) => {
    if (!guess) return 'bg-gray-800 border-gray-700';
    
    const letter = guess[position];
    if (!letter) return 'bg-gray-800 border-gray-700';
    
    if (letter === targetWord[position]) return 'bg-green-500 border-green-500';
    if (targetWord.includes(letter)) return 'bg-yellow-500 border-yellow-500';
    return 'bg-gray-700 border-gray-600';
  };

  return (
    <div className="flex min-h-screen flex-col bg-background font-sans antialiased">
      <Header />
      <main className="flex flex-1 flex-col items-center justify-center p-4 sm:p-6 md:p-8 lg:py-12">
        <div className="w-full max-w-lg space-y-6">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold">Time Limit Mode</h1>
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              <CountdownTimer 
                remainingTime={remainingTime} 
                onComplete={handleTimeUp} 
              />
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-center">
                {gameStatus === 'won' && '🎉 You Won!'}
                {gameStatus === 'lost' && 'Game Over!'}
                {gameStatus === 'time-up' && 'Time Up!'}
                {gameStatus === 'playing' && 'Enter a 5-letter word'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Word grid */}
              <div className="grid grid-cols-5 gap-2">
                {Array.from({ length: MAX_ATTEMPTS }).map((_, rowIdx) => (
                  <div key={rowIdx} className="grid grid-cols-5 gap-2">
                    {Array.from({ length: WORD_LENGTH }).map((_, colIdx) => {
                      const guess = guesses[rowIdx];
                      return (
                        <div
                          key={colIdx}
                          className={`flex h-14 w-14 items-center justify-center rounded border-2 text-xl font-bold uppercase transition-colors
                            ${getTileColor(guess, colIdx)}`}
                        >
                          {guess?.[colIdx] || ''}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>

              {/* Input area */}
              <div className="flex flex-col items-center gap-4">
                {gameStatus === 'playing' && (
                  <div className="flex gap-2 w-full max-w-xs">
                    <Input
                      ref={inputRef}
                      value={currentGuess}
                      onChange={handleInputChange}
                      onKeyDown={handleKeyDown}
                      maxLength={WORD_LENGTH}
                      className="text-center text-xl uppercase flex-1"
                      placeholder={`Guess #${currentAttempt + 1}`}
                      autoFocus
                    />
                    <Button onClick={submitGuess} disabled={currentGuess.length !== WORD_LENGTH}>
                      <Check className="h-4 w-4" />
                    </Button>
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    onClick={resetGame}
                    className="flex items-center gap-2"
                  >
                    <RotateCcw className="h-4 w-4" />
                    New Game
                  </Button>
                </div>
              </div>

              {/* Game status messages */}
              {gameStatus !== 'playing' && (
                <div className="text-center py-4">
                  <p className="text-lg font-semibold">
                    {gameStatus === 'won' && 'Congratulations! You guessed the word!'}
                    {gameStatus === 'lost' && `The word was: ${targetWord}`}
                    {gameStatus === 'time-up' && `The word was: ${targetWord}`}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
      <Footer />
    </div>
  );
}