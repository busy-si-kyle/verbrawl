import { NextRequest } from 'next/server';
import { getRedisClient, getRedisPubSubClient } from '@/lib/redis';
import { ROOM_TTL, COUNTDOWN_DURATION } from '@/lib/constants';
import { countActiveRooms } from '@/lib/player-count-utils';
import { ROOM_UPDATES_CHANNEL_PREFIX } from '../../../../lib/room-utils';

const ROOM_PREFIX = 'room:';
const PLAYER_PREFIX = 'player:';
const HEARTBEAT_INTERVAL = 30000; // 30 seconds

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const redis = getRedisClient();
  const subscriber = getRedisPubSubClient().duplicate(); // Create a duplicate for subscription

  // Ensure Redis is connected
  if (!redis.isOpen) {
    await redis.connect();
  }

  // Connect the subscriber client
  await subscriber.connect();

  const url = new URL(req.url);
  const roomCode = url.searchParams.get('roomCode');
  const playerId = url.searchParams.get('playerId');

  if (!roomCode || !playerId) {
    await subscriber.disconnect();
    return new Response('Room code and player ID are required', { status: 400 });
  }

  console.log(`[DEBUG] SSE connection attempt - roomCode: ${roomCode}, playerId: ${playerId}`);

  // Check if room exists
  const roomExists = await redis.exists(`${ROOM_PREFIX}${roomCode}`);
  if (!roomExists) {
    await subscriber.disconnect();
    return new Response('Room not found', { status: 404 });
  }

  // Verify player is in the room
  const playerRoomCode = await redis.get(`${PLAYER_PREFIX}${playerId}`);

  // Trigger cleanup of expired rooms on new connection
  countActiveRooms(redis).catch(err => console.error('Background room cleanup error (SSE):', err));

  if (playerRoomCode !== roomCode) {
    await subscriber.disconnect();
    return new Response('Player not in this room', { status: 403 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      let isClosed = false;

      // Function to send data to client
      const sendData = (data: any) => {
        if (isClosed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch (error) {
          console.error('Error sending data:', error);
        }
      };

      // Function to process room data and calculate countdown
      const processRoomData = (roomData: any) => {
        // Calculate remaining countdown time if in countdown state
        let remainingCountdown = null;
        let status = roomData.status;

        if (status === 'countdown') {
          if (roomData.countdownStart) {
            const countdownStart = Number(roomData.countdownStart);
            if (isNaN(countdownStart) || countdownStart <= 0) {
              remainingCountdown = COUNTDOWN_DURATION; // Default to 5 seconds
            } else {
              const elapsed = Date.now() - countdownStart;
              remainingCountdown = Math.max(0, COUNTDOWN_DURATION - elapsed);

              // If countdown has finished, report status as in-progress
              if (remainingCountdown === 0) {
                status = 'in-progress';
              }
            }
          } else {
            remainingCountdown = COUNTDOWN_DURATION;
          }
        }

        return {
          roomCode,
          players: roomData.players,
          playerNicknames: roomData.playerNicknames || {},
          scores: roomData.scores || {},
          words: roomData.words || [],
          currentWordIndex: roomData.currentWordIndex || 0,
          lastAction: roomData.lastAction || null,
          gameOver: roomData.gameOver || false,
          winner: roomData.winner || null,
          status,
          countdownStart: roomData.countdownStart,
          readyPlayers: roomData.readyPlayers || [],
          remainingCountdown,
          timestamp: Date.now(),
          lastActivity: roomData.lastActivity
        };
      };

      // 1. Send initial state immediately
      try {
        const roomDataString = await redis.get(`${ROOM_PREFIX}${roomCode}`);
        if (roomDataString) {
          const roomData = JSON.parse(roomDataString);
          sendData(processRoomData(roomData));
        } else {
          // Room gone
          if (!isClosed) {
            controller.enqueue(encoder.encode('event: close\ndata: {"message":"Room no longer exists"}\n\n'));
            controller.close();
            isClosed = true;
            await subscriber.disconnect();
            return;
          }
        }
      } catch (error) {
        console.error('Error sending initial state:', error);
      }

      // 2. Subscribe to Redis channel for updates
      try {
        await subscriber.subscribe(`${ROOM_UPDATES_CHANNEL_PREFIX}${roomCode}`, (message) => {
          if (isClosed) return;
          try {
            const roomData = JSON.parse(message);
            sendData(processRoomData(roomData));
          } catch (error) {
            console.error('Error parsing pub/sub message:', error);
          }
        });
      } catch (error) {
        console.error('Error subscribing to channel:', error);
      }

      // 3. Heartbeat to keep connection alive
      const heartbeatInterval = setInterval(async () => {
        if (!isClosed) {
          try {
            // Check if room still exists
            const exists = await redis.exists(`${ROOM_PREFIX}${roomCode}`);
            if (!exists) {
              const expiredData = { status: 'expired', message: 'Room closed due to inactivity' };
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(expiredData)}\n\n`));

              // Close connection
              clearInterval(heartbeatInterval);
              isClosed = true;
              controller.close();
              if (subscriber.isOpen) {
                await subscriber.unsubscribe(`${ROOM_UPDATES_CHANNEL_PREFIX}${roomCode}`);
                await subscriber.disconnect();
              }
              return;
            }

            // Just send heartbeat - Pub/Sub handles room updates
            controller.enqueue(encoder.encode(`: heartbeat\n\n`));
          } catch (error) {
            console.error('Error sending heartbeat:', error);
            clearInterval(heartbeatInterval);
          }
        }
      }, 30000); // Heartbeat every 30 seconds

      // Cleanup on connection close
      req.signal.addEventListener('abort', async () => {
        if (!isClosed) {
          clearInterval(heartbeatInterval);
          isClosed = true;
          try {
            if (subscriber.isOpen) {
              await subscriber.unsubscribe(`${ROOM_UPDATES_CHANNEL_PREFIX}${roomCode}`);
              await subscriber.disconnect();
            }
            // No need to close controller on abort, it's already closed/errored
          } catch (err) {
            console.error('Error during cleanup:', err);
          }
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