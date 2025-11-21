import { NextRequest } from 'next/server';
import { getRedisClient } from '@/lib/redis';
import { ROOM_TTL } from '@/lib/constants';
import { publishRoomUpdate } from '../../../../lib/room-utils';

const ROOM_PREFIX = 'room:';

export async function PUT(request: NextRequest) {
  const redis = getRedisClient();

  if (!redis.isOpen) {
    await redis.connect();
  }

  try {
    const { roomCode, playerId, words } = await request.json();

    if (!roomCode || !playerId || !words) {
      return new Response(JSON.stringify({ error: 'Room code, player ID, and words are required' }), {
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
    if (!roomData.players || !roomData.players.includes(playerId)) {
      return new Response(JSON.stringify({ error: 'Player not in this room' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Update room's word list
    roomData.words = words;

    // Update room data in Redis
    await redis.setEx(`${ROOM_PREFIX}${roomCode}`, ROOM_TTL, JSON.stringify(roomData));

    // Publish update to subscribers
    await publishRoomUpdate(roomCode, roomData);

    return new Response(JSON.stringify({
      roomCode,
      words: roomData.words,
      message: 'Words updated successfully'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error updating words:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}