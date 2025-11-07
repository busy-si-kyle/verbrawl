import { NextRequest } from 'next/server';
import { getRedisClient } from '@/lib/redis';

const ROOM_PREFIX = 'room:';
const PLAYER_PREFIX = 'player:';
const HEARTBEAT_INTERVAL = 30000; // 30 seconds
const UPDATE_INTERVAL = 2000; // 2 seconds - more frequent for better score updates

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const redis = getRedisClient();
  
  // Ensure Redis is connected
  if (!redis.isOpen) {
    await redis.connect();
  }

  const url = new URL(req.url);
  const roomCode = url.searchParams.get('roomCode');
  const playerId = url.searchParams.get('playerId');

  if (!roomCode || !playerId) {
    return new Response('Room code and player ID are required', { status: 400 });
  }

  // Verify player is in the room
  const playerRoomCode = await redis.get(`${PLAYER_PREFIX}${playerId}`);
  if (playerRoomCode !== roomCode) {
    return new Response('Player not in this room', { status: 403 });
  }

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      let isClosed = false;
      
      // Function to send room state update
      const sendUpdate = async () => {
        if (isClosed) return;
        
        try {
          const roomDataString = await redis.get(`${ROOM_PREFIX}${roomCode}`);
          
          if (!roomDataString) {
            // Room doesn't exist anymore, send close event
            if (!isClosed) {
              controller.enqueue(encoder.encode('event: close\ndata: {"message":"Room no longer exists"}\n\n'));
              controller.close();
              isClosed = true;
            }
            return;
          }

          const roomData = JSON.parse(roomDataString);

          // Calculate remaining countdown time if in countdown state
          let remainingCountdown = null;
          if (roomData.status === 'countdown') {
            // When room is in countdown status, countdownStart should be set
            // Ensure countdownStart is a number, as Redis may store it as string
            if (roomData.countdownStart) {
              const countdownStart = Number(roomData.countdownStart);
              
              // Validate that countdownStart is a valid timestamp
              if (isNaN(countdownStart) || countdownStart <= 0) {
                console.error(`Invalid countdownStart for room ${roomCode}: ${roomData.countdownStart}`);
                // Set a default behavior if countdownStart is invalid
                remainingCountdown = 10000; // Default to 10 seconds
              } else {
                const elapsed = Date.now() - countdownStart;
                remainingCountdown = Math.max(0, 10000 - elapsed); // 10 seconds countdown
                
                if (remainingCountdown <= 0) {
                  // Countdown has finished
                  remainingCountdown = 0; // Ensure it's exactly 0
                  console.log(`Room ${roomCode} countdown finished, will update to in-progress`);
                } else {
                  console.log(`Room ${roomCode} countdown status: ${Math.ceil(remainingCountdown / 1000)}s remaining, elapsed: ${Date.now() - countdownStart}ms`);
                }
              }
            } else {
              // If status is countdown but countdownStart is not set, 
              // there's an inconsistent state - default to 10 seconds
              console.error(`Room ${roomCode} is in countdown status but has no countdownStart`);
              remainingCountdown = 10000; // Default to 10 seconds
            }
          }

          // If countdown is finished, update the status in the data we're sending
          // and update Redis for future requests
          let responseData = {
            roomCode,
            players: roomData.players,
            scores: roomData.scores || {},
            words: roomData.words || [],
            gameOver: roomData.gameOver || false,
            winner: roomData.winner || null,
            status: roomData.status,
            countdownStart: roomData.countdownStart,
            remainingCountdown,
            timestamp: Date.now()
          };
          
          // After sending the message, if countdown is finished, update Redis
          if (remainingCountdown !== null && remainingCountdown <= 0) {
            // Update the response data to reflect the new status
            responseData = {
              ...responseData,
              status: 'in-progress',
              countdownStart: null
            };
            
            // Create an updated room data object to avoid modifying the original in this scope
            const updatedRoomData = {
              ...roomData,
              status: 'in-progress',
              countdownStart: null
            };
            
            // Update room data in Redis
            await redis.setEx(`${ROOM_PREFIX}${roomCode}`, 60 * 15, JSON.stringify(updatedRoomData));
            console.log(`Room ${roomCode} updated to in-progress in Redis`);
          }
          
          if (!isClosed) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(responseData)}\n\n`)
            );
          }
        } catch (error) {
          if (!isClosed) {
            console.error('Error sending room update:', error);
            try {
              controller.enqueue(
                encoder.encode(`event: error\ndata: {"error":"${(error as Error).message}"}\n\n`)
              );
            } catch (enqueueError) {
              console.error('Error enqueuing error message:', enqueueError);
            }
          }
        }
      };

      // Send initial room state
      sendUpdate();

      // Send updates at intervals - more frequent for better score sync
      const updateInterval = setInterval(sendUpdate, UPDATE_INTERVAL);

      // Send heartbeat to keep connection alive
      const heartbeatInterval = setInterval(() => {
        if (!isClosed) {
          try {
            // Send data comment as heartbeat (this won't trigger onmessage, just keeps connection alive)
            controller.enqueue(encoder.encode(`: heartbeat\n\n`));
          } catch (error) {
            console.error('Error sending heartbeat:', error);
            clearInterval(heartbeatInterval);
          }
        }
      }, HEARTBEAT_INTERVAL);

      // Cleanup on connection close
      req.signal.addEventListener('abort', () => {
        if (!isClosed) {
          clearInterval(updateInterval);
          clearInterval(heartbeatInterval);
          controller.close();
          isClosed = true;
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