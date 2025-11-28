import { NextRequest } from 'next/server';
import { getRedisClient } from '@/lib/redis';
import { ROOM_TTL, WAITING_RANDOM_ROOMS, COUNTDOWN_DURATION } from '@/lib/constants';
import { countActiveRooms } from '@/lib/player-count-utils';
import { publishRoomUpdate } from '../../../lib/room-utils';

const ROOMS_SET = 'active_rooms';
const ROOM_PREFIX = 'room:';
const PLAYER_PREFIX = 'player:';

export async function POST(request: NextRequest) {
  const redis = getRedisClient();

  // Ensure Redis is connected
  if (!redis.isOpen) {
    await redis.connect();
  }

  try {
    const { playerId, nickname, joinRandom } = await request.json();

    if (!playerId) {
      return new Response(JSON.stringify({ error: 'Player ID is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Handle Join Random Room Request
    if (joinRandom) {
      // Try to pop a room from the waiting list
      const waitingRoomCode = await redis.lPop(WAITING_RANDOM_ROOMS);

      if (waitingRoomCode) {
        // Check if the room still exists and is valid
        const roomDataString = await redis.get(`${ROOM_PREFIX}${waitingRoomCode}`);

        if (roomDataString) {
          const roomData = JSON.parse(roomDataString);

          // Double check it's not full (shouldn't be if it was in the list, but good to be safe)
          if (roomData.players.length < 2) {
            // Check for nickname conflict
            const creatorId = roomData.players[0];
            const creatorNickname = roomData.playerNicknames?.[creatorId] || '';

            if (nickname && creatorNickname && nickname.toLowerCase() === creatorNickname.toLowerCase()) {
              // Nickname conflict!
              // Put the room back in the queue (at the end, so others can join)
              await redis.rPush(WAITING_RANDOM_ROOMS, waitingRoomCode);

              return new Response(JSON.stringify({ error: "Nickname taken. Please change!" }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
              });
            }

            // JOIN THE EXISTING RANDOM ROOM
            console.log(`[DEBUG] Joining existing random room: ${waitingRoomCode}`);

            // Add player to room
            roomData.players.push(playerId);

            // Initialize score
            if (!roomData.scores) roomData.scores = {};
            roomData.scores[playerId] = 0;

            // Add nickname
            if (!roomData.playerNicknames) roomData.playerNicknames = {};
            roomData.playerNicknames[playerId] = nickname || '';

            // Check if room is full (it should be now)
            if (roomData.players.length === 2) {
              console.log(`Room ${waitingRoomCode} full, waiting for players to be ready`);
            }

            // Refresh room activity
            await redis.zAdd(ROOMS_SET, {
              score: Date.now(),
              value: waitingRoomCode
            });

            // Update lastActivity
            roomData.lastActivity = Date.now();

            // Update room data in Redis
            await redis.setEx(`${ROOM_PREFIX}${waitingRoomCode}`, ROOM_TTL, JSON.stringify(roomData));

            // Add player mapping
            await redis.setEx(`${PLAYER_PREFIX}${playerId}`, ROOM_TTL, waitingRoomCode);

            // Publish update to subscribers
            await publishRoomUpdate(waitingRoomCode, roomData);

            return new Response(JSON.stringify({
              roomCode: waitingRoomCode,
              players: roomData.players,
              playerNicknames: roomData.playerNicknames,
              scores: roomData.scores,
              words: roomData.words,
              gameOver: roomData.gameOver,
              winner: roomData.winner,
              status: roomData.status,
              countdownStart: roomData.countdownStart,
              readyPlayers: roomData.readyPlayers,
              message: 'Joined random room successfully',
              type: 'random',
              lastActivity: roomData.lastActivity
            }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            });
          }
        }
        // If room didn't exist or was full, fall through to create a new one
      }
    }

    // Generate a unique 5-digit room code
    let roomCode: string | null = null;
    let isUnique = false;
    let attempts = 0;

    while (!isUnique && attempts < 10) {
      const potentialRoomCode = Math.floor(10000 + Math.random() * 90000).toString();
      const roomExists = await redis.exists(`${ROOM_PREFIX}${potentialRoomCode}`);

      if (!roomExists) {
        roomCode = potentialRoomCode;
        isUnique = true;
      }

      attempts++;
    }

    if (!roomCode) {
      return new Response(JSON.stringify({ error: 'Failed to generate unique room code' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    console.log(`[DEBUG] Generated room code: ${roomCode} for player: ${playerId} (Random: ${joinRandom})`);

    // Create new room data
    const roomData = {
      players: [playerId],
      playerNicknames: { [playerId]: nickname || '' },
      scores: { [playerId]: 0 },
      words: [],
      gameOver: false,
      winner: null,
      status: 'waiting',
      countdownStart: null,
      readyPlayers: [],
      currentWordIndex: 0,
      type: joinRandom ? 'random' : 'custom', // Mark the room type
      lastActivity: Date.now()
    };

    // Store room data in Redis
    await redis.setEx(`${ROOM_PREFIX}${roomCode}`, ROOM_TTL, JSON.stringify(roomData));
    console.log(`[DEBUG] Stored room ${roomCode} in Redis with TTL ${ROOM_TTL}`);

    // Add room to active rooms ZSET
    await redis.zAdd(ROOMS_SET, {
      score: Date.now(),
      value: roomCode
    });

    // If it's a random room, add it to the waiting list
    if (joinRandom) {
      await redis.rPush(WAITING_RANDOM_ROOMS, roomCode);
      console.log(`[DEBUG] Added room ${roomCode} to waiting_random_rooms list`);
    }

    // Add player to this room
    await redis.setEx(`${PLAYER_PREFIX}${playerId}`, ROOM_TTL, roomCode);

    // Publish update to subscribers
    await publishRoomUpdate(roomCode, roomData);

    return new Response(JSON.stringify({
      roomCode,
      players: roomData.players,
      playerNicknames: roomData.playerNicknames,
      scores: roomData.scores,
      words: roomData.words,
      gameOver: roomData.gameOver,
      winner: roomData.winner,
      status: roomData.status,
      countdownStart: roomData.countdownStart,
      readyPlayers: roomData.readyPlayers,
      currentWordIndex: roomData.currentWordIndex || 0,
      message: 'Room created successfully',
      type: roomData.type,
      lastActivity: roomData.lastActivity
    }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error creating room:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export async function PUT(request: NextRequest) {
  const redis = getRedisClient();

  // Ensure Redis is connected
  if (!redis.isOpen) {
    await redis.connect();
  }

  try {
    const { roomCode, playerId, nickname } = await request.json();

    if (!roomCode || !playerId) {
      return new Response(JSON.stringify({ error: 'Room code and player ID are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Trigger cleanup of expired rooms on join
    countActiveRooms(redis).catch(err => console.error('Background room cleanup error (Join):', err));

    // Get room data
    const roomDataString = await redis.get(`${ROOM_PREFIX}${roomCode}`);

    if (!roomDataString) {
      return new Response(JSON.stringify({ error: 'Room not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const roomData = JSON.parse(roomDataString);

    // Check if room is full (max 2 players)
    if (roomData.players.length >= 2 && !roomData.players.includes(playerId)) {
      return new Response(JSON.stringify({ error: 'Room is full' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Add player to room if not already in
    if (!roomData.players.includes(playerId)) {
      // Check for nickname conflict with existing players
      if (nickname) {
        const isNicknameTaken = roomData.players.some((pid: string) => {
          const existingNickname = roomData.playerNicknames?.[pid] || '';
          return existingNickname.toLowerCase() === nickname.toLowerCase();
        });

        if (isNicknameTaken) {
          return new Response(JSON.stringify({ error: "Nickname taken. Please change!" }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      }

      roomData.players.push(playerId);

      // Initialize score
      if (!roomData.scores) roomData.scores = {};
      roomData.scores[playerId] = 0;

      // Add nickname
      if (!roomData.playerNicknames) roomData.playerNicknames = {};
      roomData.playerNicknames[playerId] = nickname || '';

      // Update lastActivity
      roomData.lastActivity = Date.now();

      // Update room data in Redis
      await redis.setEx(`${ROOM_PREFIX}${roomCode}`, ROOM_TTL, JSON.stringify(roomData));

      // Refresh room activity
      await redis.zAdd(ROOMS_SET, {
        score: Date.now(),
        value: roomCode
      });

      // Add player mapping
      await redis.setEx(`${PLAYER_PREFIX}${playerId}`, ROOM_TTL, roomCode);

      // Publish update to subscribers
      await publishRoomUpdate(roomCode, roomData);
    } else {
      // Player already in room, just update nickname if provided
      if (nickname) {
        // Check for conflict with OTHER players (not self)
        const isNicknameTaken = roomData.players.some((pid: string) => {
          if (pid === playerId) return false; // Don't check against self
          const existingNickname = roomData.playerNicknames?.[pid] || '';
          return existingNickname.toLowerCase() === nickname.toLowerCase();
        });

        if (isNicknameTaken) {
          return new Response(JSON.stringify({ error: "Nickname taken. Please change!" }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        if (!roomData.playerNicknames) roomData.playerNicknames = {};
        roomData.playerNicknames[playerId] = nickname;

        // Update lastActivity
        roomData.lastActivity = Date.now();

        // Update room data in Redis
        await redis.setEx(`${ROOM_PREFIX}${roomCode}`, ROOM_TTL, JSON.stringify(roomData));

        // Publish update to subscribers
        await publishRoomUpdate(roomCode, roomData);
      }
    }

    return new Response(JSON.stringify({
      roomCode,
      players: roomData.players,
      playerNicknames: roomData.playerNicknames,
      scores: roomData.scores,
      words: roomData.words,
      gameOver: roomData.gameOver,
      winner: roomData.winner,
      status: roomData.status,
      countdownStart: roomData.countdownStart,
      readyPlayers: roomData.readyPlayers,
      currentWordIndex: roomData.currentWordIndex || 0,
      message: 'Joined room successfully',
      type: roomData.type,
      lastActivity: roomData.lastActivity
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error joining room:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export async function GET(request: NextRequest) {
  const redis = getRedisClient();
  const searchParams = request.nextUrl.searchParams;
  const roomCode = searchParams.get('roomCode');
  const playerId = searchParams.get('playerId');

  // Ensure Redis is connected
  if (!redis.isOpen) {
    await redis.connect();
  }

  try {
    if (!roomCode) {
      return new Response(JSON.stringify({ error: 'Room code is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Get room data
    const roomDataString = await redis.get(`${ROOM_PREFIX}${roomCode}`);

    if (!roomDataString) {
      return new Response(JSON.stringify({ error: 'Room not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const roomData = JSON.parse(roomDataString);

    // If playerId is provided, verify they are in the room
    if (playerId && !roomData.players.includes(playerId)) {
      return new Response(JSON.stringify({ error: 'Player not in this room' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Calculate remaining countdown time if in countdown state
    let remainingCountdown = null;
    if (roomData.status === 'countdown') {
      if (roomData.countdownStart) {
        const countdownStart = Number(roomData.countdownStart);
        if (isNaN(countdownStart) || countdownStart <= 0) {
          remainingCountdown = COUNTDOWN_DURATION;
        } else {
          const elapsed = Date.now() - countdownStart;
          remainingCountdown = Math.max(0, COUNTDOWN_DURATION - elapsed);
        }
      } else {
        remainingCountdown = COUNTDOWN_DURATION;
      }
    }

    return new Response(JSON.stringify({
      roomCode,
      players: roomData.players,
      playerNicknames: roomData.playerNicknames || {},
      scores: roomData.scores || {},
      words: roomData.words || [],
      gameOver: roomData.gameOver || false,
      winner: roomData.winner || null,
      status: roomData.status,
      countdownStart: roomData.countdownStart,
      readyPlayers: roomData.readyPlayers || [],
      currentWordIndex: roomData.currentWordIndex || 0,
      remainingCountdown,
      type: roomData.type,
      lastActivity: roomData.lastActivity
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error getting room info:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}