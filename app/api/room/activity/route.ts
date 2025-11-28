import { NextRequest } from 'next/server';
import { getRedisClient } from '@/lib/redis';
import { ROOM_TTL } from '@/lib/constants';
import { publishRoomUpdate } from '../../../../lib/room-utils';

const ROOM_PREFIX = 'room:';
const PLAYER_PREFIX = 'player:';
const ROOMS_SET = 'active_rooms';

// Lightweight endpoint to mark a room as active based on player activity (e.g. a guess)
export async function POST(request: NextRequest) {
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

    // Verify player is in the room
    if (!roomData.players || !roomData.players.includes(playerId)) {
      return new Response(JSON.stringify({ error: 'Player not in this room' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Update lastActivity to mark recent interaction
    roomData.lastActivity = Date.now();

    // Refresh room TTL
    await redis.setEx(`${ROOM_PREFIX}${roomCode}`, ROOM_TTL, JSON.stringify(roomData));

    // Refresh room activity in the active_rooms ZSET so inactivity cleanup
    // treats this as a keep-alive
    await redis.zAdd(ROOMS_SET, {
      score: Date.now(),
      value: roomCode,
    });

    // Also refresh the player mapping TTL so SSE reconnections keep working
    await redis.setEx(`${PLAYER_PREFIX}${playerId}`, ROOM_TTL, roomCode);

    // Publish updated state so clients receive the new lastActivity
    await publishRoomUpdate(roomCode, roomData);

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error updating room activity:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}


