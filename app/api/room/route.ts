import { NextRequest } from 'next/server';
import { getRedisClient } from '@/lib/redis';

const ROOMS_SET = 'active_rooms';
const ROOM_PREFIX = 'room:';
const PLAYER_PREFIX = 'player:';
const ROOM_TTL = 60 * 15; // 15 minutes

export async function POST(request: NextRequest) {
  const redis = getRedisClient();
  
  // Ensure Redis is connected
  if (!redis.isOpen) {
    await redis.connect();
  }

  try {
    const { playerId } = await request.json();
    
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
    
    if (!isUnique || roomCode === null) {
      return new Response(JSON.stringify({ error: 'Failed to generate unique room code' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Create the room with the first player
    const roomData = {
      players: [playerId],
      scores: { [playerId]: 0 }, // Initialize scores for the first player
      words: [], // Will be populated when game starts
      gameOver: false, // Track if game has ended
      winner: null, // Track the winner when game ends
      status: 'waiting', // waiting, countdown, in-progress
      createdAt: Date.now(),
      countdownStart: null,
    };

    // Store room data in Redis
    await redis.setEx(`${ROOM_PREFIX}${roomCode}`, ROOM_TTL, JSON.stringify(roomData));
    
    // Add room to active rooms set
    await redis.sAdd(ROOMS_SET, roomCode);
    
    // Add player to this room
    await redis.setEx(`${PLAYER_PREFIX}${playerId}`, ROOM_TTL, roomCode);
    
    return new Response(JSON.stringify({ 
      roomCode,
      message: 'Room created successfully',
      status: roomData.status
    }), {
      status: 200,
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
  
  if (!redis.isOpen) {
    await redis.connect();
  }

  try {
    const { roomCode, playerId } = await request.json();
    
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
    
    // Initialize score for the new player if scores object exists
    if (roomData.scores) {
      roomData.scores[playerId] = 0;
    } else {
      // Fallback: initialize scores object if it doesn't exist
      roomData.scores = { [playerId]: 0 };
    }
    
    // If this is the second player, start the countdown
    if (roomData.players.length === 2) {
      roomData.status = 'countdown';
      roomData.countdownStart = Date.now();
      console.log(`Room ${roomCode} countdown started at ${roomData.countdownStart}, players: ${roomData.players.length}`);
    }

    // Update room data in Redis
    await redis.setEx(`${ROOM_PREFIX}${roomCode}`, ROOM_TTL, JSON.stringify(roomData));
    
    // Add player to this room
    await redis.setEx(`${PLAYER_PREFIX}${playerId}`, ROOM_TTL, roomCode);
    
    return new Response(JSON.stringify({ 
      roomCode,
      players: roomData.players,
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