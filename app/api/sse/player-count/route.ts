import { NextRequest } from 'next/server';
import { getRedisClient } from '@/lib/redis';
import { countActiveSessions } from '@/lib/player-count-utils';

const ACTIVE_SESSIONS_SET = 'active_sessions';
const HEARTBEAT_INTERVAL = 30000; // 30 seconds
const UPDATE_INTERVAL = 30000; // 30 seconds - reduced from 5s to save Redis calls

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const redis = getRedisClient();

  // Ensure Redis is connected
  if (!redis.isOpen) {
    await redis.connect();
  }

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      let isClosed = false;

      // Function to send player count update
      const sendUpdate = async () => {
        try {
          if (isClosed) return;

          const activeCount = await countActiveSessions(redis);

          if (isClosed) return;

          const data = {
            playerCount: activeCount,
            timestamp: Date.now()
          };

          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
          );
        } catch (error) {
          if (!isClosed) {
            const errorMessage = (error as Error).message || String(error);
            if (!errorMessage.includes('Controller is already closed')) {
              console.error('Error sending player count update:', error);
            }
          }
        }
      };

      // Send initial player count
      sendUpdate();

      // Send updates at intervals
      const updateInterval = setInterval(sendUpdate, UPDATE_INTERVAL);

      // Send heartbeat to keep connection alive
      const heartbeatInterval = setInterval(() => {
        try {
          if (isClosed) return;
          controller.enqueue(encoder.encode(`: heartbeat\n\n`));
        } catch (error) {
          console.error('Error sending heartbeat:', error);
        }
      }, HEARTBEAT_INTERVAL);

      // Cleanup on connection close
      req.signal.addEventListener('abort', () => {
        if (!isClosed) {
          isClosed = true;
          clearInterval(updateInterval);
          clearInterval(heartbeatInterval);
          controller.close();
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}