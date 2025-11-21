import { NextRequest } from 'next/server';
import { getRedisClient } from '@/lib/redis';
import { ROOM_TTL, WAITING_RANDOM_ROOMS } from '@/lib/constants';
import { publishRoomUpdate } from '../../../../lib/room-utils';

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

    // Remove player's score if scores exist
    if (roomData.scores) {
      delete roomData.scores[playerId];
    }

    // If game is in countdown or in-progress and a player leaves, end the game (opponent wins by forfeit)
    // BUT only if the game isn't already over (e.g. someone just won and is leaving)
    if (!roomData.gameOver && (roomData.status === 'countdown' || roomData.status === 'in-progress') && roomData.players.length > 0) {
      roomData.gameOver = true;
      roomData.status = 'in-progress'; // Keep status as in-progress to show game over UI
      // The remaining player is the winner
      roomData.winner = roomData.players[0];
      console.log(`Player ${playerId} abandoned during ${roomData.status}. Winner by forfeit: ${roomData.winner}`);
    }

    // If no players left, delete the room
    if (roomData.players.length === 0) {
      // If this was the last player, delete the room entirely
      console.log(`[DEBUG] Last player leaving room ${roomCode}, deleting room`);
      await redis.del(`${ROOM_PREFIX}${roomCode}`);
      const removedRooms = await redis.zRem('active_rooms', roomCode);

      // If it was a random room, remove it from the waiting list
      if (roomData.type === 'random') {
        await redis.lRem(WAITING_RANDOM_ROOMS, 0, roomCode);
        console.log(`[DEBUG] Removed room ${roomCode} from waiting_random_rooms list`);
      }

      // Log if we removed a room from the set (for debugging orphaned entries)
      if (removedRooms > 0) {
        console.log(`Removed room ${roomCode} from active_rooms ZSET during leave`);
      } else {
        // The room wasn't in the active_rooms set, which indicates a potential inconsistency
        console.warn(`Room ${roomCode} was not found in active_rooms ZSET during leave`);
      }
    } else {
      // Otherwise, update the room data in Redis
      await redis.setEx(`${ROOM_PREFIX}${roomCode}`, ROOM_TTL, JSON.stringify(roomData));

      // Publish update to subscribers
      await publishRoomUpdate(roomCode, roomData);

      // If it's a random room, and it's now waiting with 1 player, make sure it's in the queue
      if (roomData.type === 'random' && roomData.status === 'waiting' && roomData.players.length === 1) {
        // We use LPOS to check if it's already there to avoid duplicates (requires Redis 6.0.6+)
        // Alternatively, we can just remove and re-add to be safe and simple
        await redis.lRem(WAITING_RANDOM_ROOMS, 0, roomCode);
        await redis.rPush(WAITING_RANDOM_ROOMS, roomCode);
        console.log(`[DEBUG] Re-queued room ${roomCode} to waiting_random_rooms list (1 player left)`);
      }
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