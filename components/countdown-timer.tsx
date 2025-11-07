'use client';

import { useEffect, useState, useRef } from 'react';

interface CountdownTimerProps {
  remainingTime: number; // in milliseconds
  onComplete: () => void;
}

export function CountdownTimer({ remainingTime, onComplete }: CountdownTimerProps) {
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
    
    // Restart the animation from the new time if we're still counting down
    if (remainingTime > 0) {
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
  }, [remainingTime, onComplete]);

  // Convert to seconds
  const seconds = Math.ceil(displayTime / 1000);

  if (displayTime <= 0) {
    return <span className="text-6xl font-bold text-primary">Go!</span>;
  }

  return (
    <div className="text-center transition-opacity duration-100">
      <div className="text-6xl font-bold text-primary mb-4 transition-all duration-75 ease-in-out">
        {seconds}
      </div>
    </div>
  );
}