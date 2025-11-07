import { NextRequest } from 'next/server';
import { getRedisClient } from '@/lib/redis';

const ROOM_PREFIX = 'room:';

export async function PUT(request: NextRequest) {
  const redis = getRedisClient();
  
  if (!redis.isOpen) {
    await redis.connect();
  }

  try {
    const { roomCode, playerId, winner } = await request.json();
    
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
    
    // Check if player is in the room
    if (!roomData.players.includes(playerId)) {
      return new Response(JSON.stringify({ error: 'Player not in this room' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Set game over state
    roomData.gameOver = true;
    roomData.winner = winner;
    
    // Update room data in Redis
    await redis.setEx(`${ROOM_PREFIX}${roomCode}`, 60 * 15, JSON.stringify(roomData));
    
    return new Response(JSON.stringify({ 
      roomCode,
      gameOver: roomData.gameOver,
      winner: roomData.winner,
      message: 'Game over state updated successfully'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error updating game over state:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}