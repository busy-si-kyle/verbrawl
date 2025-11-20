import { NextRequest } from 'next/server';
import { getRedisClient } from '@/lib/redis';
import { ROOM_TTL } from '@/lib/constants';
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
    const { playerId, nickname } = await request.json();

    if (!playerId) {
      return new Response(JSON.stringify({ error: 'Player ID is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
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

    console.log(`[DEBUG] Generated room code: ${roomCode} for player: ${playerId}`);

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
    };

    // Store room data in Redis
    await redis.setEx(`${ROOM_PREFIX}${roomCode}`, ROOM_TTL, JSON.stringify(roomData));
    console.log(`[DEBUG] Stored room ${roomCode} in Redis with TTL ${ROOM_TTL}`);

    // Verify the TTL was set correctly
    const actualTTL = await redis.ttl(`${ROOM_PREFIX}${roomCode}`);
    console.log(`[DEBUG] Room ${roomCode} actual TTL in Redis: ${actualTTL} seconds`);

    // Add room to active rooms ZSET
    await redis.zAdd(ROOMS_SET, {
      score: Date.now(),
      value: roomCode
    });
    console.log(`[DEBUG] Added room ${roomCode} to active rooms ZSET`);

    // Add player to this room
    await redis.setEx(`${PLAYER_PREFIX}${playerId}`, ROOM_TTL, roomCode);
    console.log(`[DEBUG] Assigned player ${playerId} to room ${roomCode}`);

    // Verify the room was stored correctly
    const verifyRoom = await redis.exists(`${ROOM_PREFIX}${roomCode}`);
    console.log(`[DEBUG] Room ${roomCode} exists in Redis after creation?: ${verifyRoom}`);
    if (!verifyRoom) {
      console.error(`[ERROR] Room ${roomCode} was not persisted to Redis!`);
    }

    console.log(`[DEBUG] Returning success response for room ${roomCode}`);
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
      message: 'Room created successfully',
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

    // If this is the second player, start the countdown
    if (roomData.players.length === 2) {
      roomData.status = 'countdown';
      roomData.countdownStart = Date.now();
      console.log(`Room ${roomCode} countdown started at ${roomData.countdownStart}, players: ${roomData.players.length}`);
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
      message: roomData.players.length === 2 ? 'Countdown started!' : 'Joined room successfully',
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