import { NextRequest } from 'next/server';
import { getRedisClient } from '@/lib/redis';

const ROOM_PREFIX = 'room:';
const PLAYER_PREFIX = 'player:';

export async function POST(request: NextRequest) {
  const redis = getRedisClient();
  
  // Ensure Redis is connected
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
    
    // Find and remove the player from the room
    const playerIndex = roomData.players.indexOf(playerId);
    if (playerIndex === -1) {
      return new Response(JSON.stringify({ error: 'Player not in this room' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Remove player from the room
    roomData.players.splice(playerIndex, 1);
    
    // If no players left, delete the room
    if (roomData.players.length === 0) {
      await redis.del(`${ROOM_PREFIX}${roomCode}`);
      await redis.sRem('active_rooms', roomCode);
    } else {
      // Otherwise, update the room data in Redis
      await redis.setEx(`${ROOM_PREFIX}${roomCode}`, 60 * 15, JSON.stringify(roomData));
    }
    
    // Remove player-to-room mapping
    await redis.del(`${PLAYER_PREFIX}${playerId}`);
    
    return new Response(JSON.stringify({ 
      message: 'Successfully left room',
      playersLeft: roomData.players.length
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error leaving room:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}