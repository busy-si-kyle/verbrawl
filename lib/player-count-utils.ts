// lib/player-count-utils.ts
import type { RedisClientType } from 'redis';

const SESSION_PREFIX = 'session:';
const ACTIVE_SESSIONS_SET = 'active_sessions';
const ROOM_PREFIX = 'room:';
const ROOMS_SET = 'active_rooms';

/**
 * Helper function to count active sessions using ZSET.
 * Automatically removes expired sessions (older than 90 seconds).
 *
 * @param redis - Redis client instance
 * @returns Promise<number> - The count of active sessions
 */
export async function countActiveSessions(redis: RedisClientType): Promise<number> {
  try {
    const now = Date.now();
    const ninetySecondsAgo = now - 90 * 1000;

    // Remove sessions with score less than 90 seconds ago
    await redis.zRemRangeByScore(ACTIVE_SESSIONS_SET, '-inf', ninetySecondsAgo);

    // Return the count of remaining sessions
    return await redis.zCard(ACTIVE_SESSIONS_SET);
  } catch (error) {
    console.error('Error counting active sessions:', error);
    return 0;
  }
}

/**
 * Helper function to count active rooms using ZSET.
 * Automatically removes expired rooms (older than 90 seconds).
 *
 * @param redis - Redis client instance
 * @returns Promise<number> - The count of active rooms
 */
export async function countActiveRooms(redis: RedisClientType): Promise<number> {
  try {
    const now = Date.now();
    const ninetySecondsAgo = now - 90 * 1000;

    console.log(`[DEBUG] countActiveRooms: Cleaning up rooms older than ${new Date(ninetySecondsAgo).toISOString()}`);

    // Get rooms that will be removed for logging
    const roomsToRemove = await redis.zRangeByScore(ROOMS_SET, '-inf', ninetySecondsAgo);
    if (roomsToRemove.length > 0) {
      console.log(`[DEBUG] countActiveRooms: Removing ${roomsToRemove.length} rooms from ZSET:`, roomsToRemove);

      // Publish expiration event for each room BEFORE removing
      // We need to dynamically import to avoid circular dependencies if any, 
      // but since this is a lib file, standard import should be fine if structure allows.
      // However, to be safe and clean, let's assume we can import publishRoomUpdate.
      // If circular dependency issues arise, we might need to move things.
      // Given the file structure, importing from ../lib/room-utils might be tricky if it imports this file.
      // Let's check imports. room-utils imports redis. this file imports redis. 
      // It seems safe.

      // We'll use a direct redis publish here to avoid importing publishRoomUpdate if it causes issues,
      // OR just import it. Let's try importing it at the top.

      for (const roomCode of roomsToRemove) {
        try {
          // Manually publish to avoid import cycles if any, and to keep this lib focused
          // The channel prefix is 'room-updates:'
          const channel = `room-updates:${roomCode}`;
          const expiredMessage = JSON.stringify({
            status: 'expired',
            message: 'Session expired due to inactivity'
          });
          await redis.publish(channel, expiredMessage);
          console.log(`[DEBUG] Published expiration event for room ${roomCode}`);
        } catch (e) {
          console.error(`Failed to publish expiration for room ${roomCode}`, e);
        }
      }
    }

    // Remove rooms with score less than 90 seconds ago
    await redis.zRemRangeByScore(ROOMS_SET, '-inf', ninetySecondsAgo);

    // Return the count of remaining rooms
    const count = await redis.zCard(ROOMS_SET);
    console.log(`[DEBUG] countActiveRooms: ${count} active rooms remaining`);
    return count;
  } catch (error) {
    console.error('Error counting active rooms:', error);
    return 0;
  }
}

