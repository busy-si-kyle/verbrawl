import { NextRequest } from 'next/server';
import { getRedisClient, getRedisPubSubClient } from '@/lib/redis';
import { countActiveSessions } from '@/lib/player-count-utils';
import { PLAYER_COUNT_CHANNEL } from '@/lib/player-count-constants';

const ACTIVE_SESSIONS_SET = 'active_sessions';
const HEARTBEAT_INTERVAL = 30000; // 30 seconds
const UPDATE_INTERVAL = 30000; // 30 seconds - fallback polling

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const redis = getRedisClient();
  const subscriber = getRedisPubSubClient().duplicate();

  // Ensure Redis is connected
  if (!redis.isOpen) {
    await redis.connect();
  }

  await subscriber.connect();

  const stream = new ReadableStream({
    async start(controller) {
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

      // Subscribe to Pub/Sub updates (instant)
      try {
        await subscriber.subscribe(PLAYER_COUNT_CHANNEL, () => {
          sendUpdate();
        });
      } catch (error) {
        console.error('Error subscribing to player count channel:', error);
      }

      // Fallback polling (safety net)
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
      req.signal.addEventListener('abort', async () => {
        if (!isClosed) {
          isClosed = true;
          clearInterval(updateInterval);
          clearInterval(heartbeatInterval);

          try {
            if (subscriber.isOpen) {
              await subscriber.unsubscribe(PLAYER_COUNT_CHANNEL);
              await subscriber.disconnect();
            }
          } catch (err) {
            console.error('Error cleaning up subscriber:', err);
          }

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