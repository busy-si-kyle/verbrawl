'use client';

import { useEffect, useState, useRef } from 'react';

interface CountdownTimerProps {
  remainingTime: number; // in milliseconds
  onComplete: () => void;
  timerStarted?: boolean; // Whether the timer has started
  showInMinutes?: boolean; // Whether to show time in MM:SS format
}

export function CountdownTimer({ remainingTime, onComplete, timerStarted = true, showInMinutes = false }: CountdownTimerProps) {
  const [displayTime, setDisplayTime] = useState(remainingTime);
  const prevRemainingTimeRef = useRef(remainingTime);
  const animationRef = useRef<NodeJS.Timeout | null>(null);

  // Update the display time when remainingTime prop changes
  useEffect(() => {
    // Store the new remainingTime value
    prevRemainingTimeRef.current = remainingTime;
    
    // Clear any existing interval when prop changes
    if (animationRef.current) {
      clearInterval(animationRef.current);
      animationRef.current = null;
    }
    
    // Restart the animation from the new time if we're still counting down and timer has started
    if (remainingTime > 0 && timerStarted) {
      animationRef.current = setInterval(() => {
        setDisplayTime(prev => {
          const newTime = Math.max(0, prev - 100);
          if (newTime <= 0) {
            if (animationRef.current) {
              clearInterval(animationRef.current);
              animationRef.current = null;
            }
            onComplete();
          }
          return newTime;
        });
      }, 100);
    }

    return () => {
      if (animationRef.current) {
        clearInterval(animationRef.current);
        animationRef.current = null;
      }
    };
  }, [remainingTime, onComplete, timerStarted]);

  // Format time as MM:SS if required
  const formatTime = (timeInMs: number) => {
    const totalSeconds = Math.ceil(timeInMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  // Convert to seconds
  const seconds = Math.ceil(displayTime / 1000);

  if (!timerStarted) {
    // If timer hasn't started yet, show a waiting message or the initial time
    if (showInMinutes) {
      return (
        <div className="text-center transition-opacity duration-100">
          <div className="text-2xl font-bold text-primary transition-all duration-75 ease-in-out">
            {formatTime(remainingTime)}
          </div>
        </div>
      );
    } else {
      return (
        <div className="text-center transition-opacity duration-100">
          <div className="text-6xl font-bold text-primary mb-4 transition-all duration-75 ease-in-out">
            {Math.ceil(remainingTime / 1000)}
          </div>
        </div>
      );
    }
  }

  if (displayTime <= 0) {
    return <span className="text-2xl font-bold text-primary">0:00</span>;
  }

  if (showInMinutes) {
    return (
      <div className="text-center transition-opacity duration-100">
        <div className="text-2xl font-bold text-primary transition-all duration-75 ease-in-out">
          {formatTime(displayTime)}
        </div>
      </div>
    );
  } else {
    return (
      <div className="text-center transition-opacity duration-100">
        <div className="text-6xl font-bold text-primary mb-4 transition-all duration-75 ease-in-out">
          {seconds}
        </div>
      </div>
    );
  }
}