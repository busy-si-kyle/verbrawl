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

    // Only update activity if >10 seconds have passed
    const now = Date.now();
    const prevLastActivity = roomData.lastActivity || 0;
    if (now - prevLastActivity < 10000) {
      // No need to update Redis or broadcast, already fresh
      return new Response(JSON.stringify({ ok: true, message: 'Activity recently updated' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    roomData.lastActivity = now;

    // Redis multi/transaction for efficiency and atomicity
    const multi = redis.multi();
    multi.setEx(`${ROOM_PREFIX}${roomCode}`, ROOM_TTL, JSON.stringify(roomData));
    multi.zAdd(ROOMS_SET, {
      score: now,
      value: roomCode,
    });
    multi.setEx(`${PLAYER_PREFIX}${playerId}`, ROOM_TTL, roomCode);
    await multi.exec();

    // Publish update so clients reset their local expiration timers
    await publishRoomUpdate(roomCode, roomData);

    return new Response(JSON.stringify({ ok: true, message: 'Activity updated' }), {
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


