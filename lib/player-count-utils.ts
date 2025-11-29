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
    const CLEANUP_INTERVAL = 60 * 1000; // 60 seconds

    // Check if we should cleanup
    const lastCleanup = await redis.get('session:last_cleanup');
    const shouldCleanup = !lastCleanup || (now - parseInt(lastCleanup) > CLEANUP_INTERVAL);

    if (shouldCleanup) {
      // Remove sessions with score less than 90 seconds ago
      await redis.zRemRangeByScore(ACTIVE_SESSIONS_SET, '-inf', ninetySecondsAgo);
      // Update last cleanup time
      await redis.set('session:last_cleanup', now.toString());
    }

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
    const CLEANUP_INTERVAL = 60 * 1000; // 60 seconds

    // Check if we should cleanup
    const lastCleanup = await redis.get('room:last_cleanup');
    const shouldCleanup = !lastCleanup || (now - parseInt(lastCleanup) > CLEANUP_INTERVAL);

    if (shouldCleanup) {
      console.log(`[DEBUG] countActiveRooms: Cleaning up rooms older than ${new Date(ninetySecondsAgo).toISOString()}`);

      // Get rooms that will be removed for logging
      const roomsToRemove = await redis.zRangeByScore(ROOMS_SET, '-inf', ninetySecondsAgo);
      if (roomsToRemove.length > 0) {
        console.log(`[DEBUG] countActiveRooms: Removing ${roomsToRemove.length} rooms from ZSET:`, roomsToRemove);

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

      // Update last cleanup time
      await redis.set('room:last_cleanup', now.toString());
    }

    // Return the count of remaining rooms
    const count = await redis.zCard(ROOMS_SET);
    if (shouldCleanup) {
      console.log(`[DEBUG] countActiveRooms: ${count} active rooms remaining`);
    }
    return count;
  } catch (error) {
    console.error('Error counting active rooms:', error);
    return 0;
  }
}

