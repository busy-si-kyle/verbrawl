import { NextRequest } from 'next/server';
import { getRedisClient } from '@/lib/redis';
import { ROOM_TTL, WAITING_RANDOM_ROOMS } from '@/lib/constants';
import { countActiveRooms } from '@/lib/player-count-utils';

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

              return new Response(JSON.stringify({ error: "Nickname taken by room creator. Please choose another." }), {
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

            // Update room data in Redis
            await redis.setEx(`${ROOM_PREFIX}${waitingRoomCode}`, ROOM_TTL, JSON.stringify(roomData));

            // Refresh room activity
            await redis.zAdd(ROOMS_SET, {
              score: Date.now(),
              value: waitingRoomCode
            });

            // Add player mapping
            await redis.setEx(`${PLAYER_PREFIX}${playerId}`, ROOM_TTL, waitingRoomCode);

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
              type: 'random'
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
      type: joinRandom ? 'random' : 'custom' // Mark the room type
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
      message: 'Room created successfully',
      type: roomData.type
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

    // Get room data
    const roomDataString = await redis.get(`${ROOM_PREFIX}${roomCode}`);

    if (!roomDataString) {
      return new Response(JSON.stringify({ error: 'Room not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const roomData = JSON.parse(roomDataString);

    // Check if room is already full
    if (roomData.players.length >= 2) {
      return new Response(JSON.stringify({ error: 'Room is already full' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Check if player is already in this room
    if (roomData.players.includes(playerId)) {
      return new Response(JSON.stringify({ error: 'Player is already in this room' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Check if nickname is the same as the creator's nickname
    // The creator is always the first player in the players array
    const creatorId = roomData.players[0];
    const creatorNickname = roomData.playerNicknames?.[creatorId] || '';

    if (nickname && creatorNickname && nickname.toLowerCase() === creatorNickname.toLowerCase()) {
      return new Response(JSON.stringify({ error: "Nickname cannot match room creator" }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Add player to room
    roomData.players.push(playerId);

    // Initialize score for the new player
    if (roomData.scores) {
      roomData.scores[playerId] = 0;
    } else {
      roomData.scores = { [playerId]: 0 };
    }

    // Add player nickname
    if (!roomData.playerNicknames) {
      roomData.playerNicknames = {};
    }
    roomData.playerNicknames[playerId] = nickname || '';

    // If this is the second player, we don't start countdown automatically anymore
    // Instead we wait for both players to be ready
    if (roomData.players.length === 2) {
      // roomData.status = 'countdown'; // REMOVED: Auto-start
      // roomData.countdownStart = Date.now(); // REMOVED: Auto-start
      console.log(`Room ${roomCode} full, waiting for players to be ready`);
    }

    // Update room data in Redis
    await redis.setEx(`${ROOM_PREFIX}${roomCode}`, ROOM_TTL, JSON.stringify(roomData));

    // Refresh room activity timestamp in ZSET
    await redis.zAdd(ROOMS_SET, {
      score: Date.now(),
      value: roomCode
    });

    // Add player to this room
    await redis.setEx(`${PLAYER_PREFIX}${playerId}`, ROOM_TTL, roomCode);

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
      message: 'Joined room successfully',
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

  if (!redis.isOpen) {
    await redis.connect();
  }

  try {
    const { searchParams } = new URL(request.url);
    const roomCode = searchParams.get('roomCode');
    const playerId = searchParams.get('playerId');

    if (!roomCode || !playerId) {
      return new Response(JSON.stringify({ error: 'Room code and player ID are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Trigger cleanup of expired rooms
    // We do this here to ensure the active_rooms ZSET stays clean without a dedicated cron job
    // This is a "lazy" cleanup strategy triggered by user activity
    countActiveRooms(redis).catch(err => console.error('Background room cleanup error:', err));

    // Get room data
    const roomDataString = await redis.get(`${ROOM_PREFIX}${roomCode}`);

    if (!roomDataString) {
      return new Response(JSON.stringify({ error: 'Room not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const roomData = JSON.parse(roomDataString);

    // Check if the player is part of this room
    if (!roomData.players.includes(playerId)) {
      return new Response(JSON.stringify({ error: 'Player not in this room' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
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