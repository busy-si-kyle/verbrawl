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
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastSyncedTimeRef = useRef(remainingTime);
  const startTimeRef = useRef<number | null>(null);

  // Sync displayTime with remainingTime prop when it changes
  useEffect(() => {
    // Only sync if the prop actually changed (not just a re-render)
    if (remainingTime !== lastSyncedTimeRef.current) {
      lastSyncedTimeRef.current = remainingTime;
      setDisplayTime(remainingTime);
      startTimeRef.current = null; // Reset start time when prop changes
    }
  }, [remainingTime]);

  // Handle countdown animation
  useEffect(() => {
    // Clear any existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // Only start countdown if timer has started and time is positive
    if (timerStarted && remainingTime > 0 && displayTime > 0) {
      // Record when we started this countdown cycle
      if (startTimeRef.current === null) {
        startTimeRef.current = Date.now();
      }

      intervalRef.current = setInterval(() => {
        setDisplayTime(prev => {
          // Calculate elapsed time since start
          const elapsed = Date.now() - (startTimeRef.current || Date.now());
          // Calculate new time based on remainingTime prop minus elapsed
          const newTime = Math.max(0, remainingTime - elapsed);

          if (newTime <= 0) {
            if (intervalRef.current) {
              clearInterval(intervalRef.current);
              intervalRef.current = null;
            }
            startTimeRef.current = null;
            // Defer onComplete to next tick to avoid updating parent during render
            setTimeout(() => onComplete(), 0);
            return 0;
          }
          return newTime;
        });
      }, 100); // Update every 100ms for smooth animation
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [remainingTime, timerStarted, displayTime, onComplete]);

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