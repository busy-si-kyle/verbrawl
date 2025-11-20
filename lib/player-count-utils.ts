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

