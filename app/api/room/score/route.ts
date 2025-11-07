import { NextRequest } from 'next/server';
import { getRedisClient } from '@/lib/redis';

const ROOM_PREFIX = 'room:';

export async function PUT(request: NextRequest) {
  const redis = getRedisClient();
  
  if (!redis.isOpen) {
    await redis.connect();
  }

  try {
    const { roomCode, playerId, points } = await request.json();
    
    if (!roomCode || !playerId || points === undefined || points === null) {
      return new Response(JSON.stringify({ error: 'Room code, player ID, and points are required' }), {
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
    
    // Check if player is in the room
    if (!roomData.players.includes(playerId)) {
      return new Response(JSON.stringify({ error: 'Player not in this room' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Initialize scores if not existing
    if (!roomData.scores) {
      roomData.scores = {};
    }

    // Update player's score
    roomData.scores[playerId] = (roomData.scores[playerId] || 0) + points;
    
    // Update room data in Redis
    await redis.setEx(`${ROOM_PREFIX}${roomCode}`, 60 * 15, JSON.stringify(roomData));
    
    return new Response(JSON.stringify({ 
      roomCode,
      playerId,
      newScore: roomData.scores[playerId],
      scores: roomData.scores,
      message: 'Score updated successfully'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error updating score:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}