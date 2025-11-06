'use client';

import { useRealtimePlayerCount } from '@/components/realtime-player-count-provider';

export function Footer() {
  const { count: playerCount, status } = useRealtimePlayerCount();

  return (
    <footer className="border-t bg-background py-6">
      <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col items-center justify-center gap-2">
        <p className="text-sm text-muted-foreground text-center">
          Players Online: <span className="font-medium">{playerCount}</span>
          {status !== 'connected' && (
            <span className="ml-2 text-xs">
              ({status === 'connecting' ? 'Connecting...' : 'Disconnected'})
            </span>
          )}
        </p>
      </div>
    </footer>
  );
}