// lib/player-count-utils.ts
import type { RedisClientType } from 'redis';

const SESSION_PREFIX = 'session:';
const ACTIVE_SESSIONS_SET = 'active_sessions';
const ROOM_PREFIX = 'room:';
const ROOMS_SET = 'active_rooms';

/**
 * Helper function to clean expired sessions from the active_sessions set.
 * Validates each session ID by checking if its Redis key still exists.
 * Removes expired sessions from the set and returns the count of valid sessions.
 *
 * @param redis - Redis client instance
 * @param forceCleanup - Whether to force cleanup even if set is large (defaults to false)
 * @returns Promise<number> - The count of valid (non-expired) sessions
 */
export async function cleanExpiredSessions(redis: RedisClientType, forceCleanup: boolean = false): Promise<number> {
  try {
    // Get all session IDs from the set
    const allSessionIds = await redis.sMembers(ACTIVE_SESSIONS_SET);

    if (allSessionIds.length === 0) {
      return 0;
    }

    // For performance, skip expensive cleanup if the set is very large and not forced
    // This prevents performance issues when there are many historical sessions
    if (!forceCleanup && allSessionIds.length > 100) {
      // Return set cardinality without expensive cleanup for large sets
      return await redis.sCard(ACTIVE_SESSIONS_SET);
    }

    const validSessionIds: string[] = [];
    const expiredSessionIds: string[] = [];

    // Check each session ID to see if its key still exists
    // Use pipeline for better performance when checking multiple keys
    const pipeline = redis.multi();
    for (const sessionId of allSessionIds) {
      pipeline.exists(`${SESSION_PREFIX}${sessionId}`);
    }
    const results = await pipeline.exec();

    // Process results and identify expired sessions
    // Redis pipeline.exec() returns tuples of [Error | null, result]
    for (let i = 0; i < allSessionIds.length; i++) {
      const sessionId = allSessionIds[i];
      const result = results?.[i];

      // Type guard: Check if result is a valid array with 2 elements
      if (!result || !Array.isArray(result) || result.length !== 2) {
        // If result structure is unexpected, treat as expired
        expiredSessionIds.push(sessionId);
        continue;
      }

      // Safely access array elements by index with runtime type validation
      // result[0] should be Error | null, result[1] should be the number result
      const error = result[0];
      const existsValue = result[1];

      // Type guard: Check if error is null or Error instance
      const hasError = error !== null && error instanceof Error;

      // Type guard: Check if existsValue is a number
      const exists = typeof existsValue === 'number' ? existsValue : null;

      // Check for errors first, then check if key exists (1 means key exists)
      if (!hasError && exists === 1) {
        validSessionIds.push(sessionId);
      } else {
        expiredSessionIds.push(sessionId);
      }
    }

    // Remove expired sessions from the set in batch
    if (expiredSessionIds.length > 0) {
      await redis.sRem(ACTIVE_SESSIONS_SET, expiredSessionIds);
    }

    return validSessionIds.length;
  } catch (error) {
    console.error('Error cleaning expired sessions:', error);
    // Fallback to set cardinality if cleanup fails
    return await redis.sCard(ACTIVE_SESSIONS_SET);
  }
}

/**
 * Helper function to clean orphaned room entries from the active_rooms set.
 * Validates each room code by checking if its Redis key still exists.
 * Removes orphaned rooms from the set and returns the count of valid rooms.
 *
 * @param redis - Redis client instance
 * @param forceCleanup - Whether to force cleanup even if set is large (defaults to false)
 * @returns Promise<number> - The count of valid (non-orphaned) rooms
 */
export async function cleanOrphanedRooms(redis: RedisClientType, forceCleanup: boolean = false): Promise<number> {
  try {
    // Get all room codes from the set
    const allRoomCodes = await redis.sMembers(ROOMS_SET);

    if (allRoomCodes.length === 0) {
      return 0;
    }

    // For performance, skip expensive cleanup if the set is very large and not forced
    // This prevents performance issues when there are many historical rooms
    if (!forceCleanup && allRoomCodes.length > 100) {
      // Return set cardinality without expensive cleanup for large sets
      return await redis.sCard(ROOMS_SET);
    }

    const validRoomCodes: string[] = [];
    const orphanedRoomCodes: string[] = [];

    // Check each room code to see if its key still exists
    // Use pipeline for better performance when checking multiple keys
    const pipeline = redis.multi();
    for (const roomCode of allRoomCodes) {
      pipeline.exists(`${ROOM_PREFIX}${roomCode}`);
    }
    const results = await pipeline.exec();

    // Process results and identify orphaned rooms
    // Redis pipeline.exec() returns tuples of [Error | null, result]
    for (let i = 0; i < allRoomCodes.length; i++) {
      const roomCode = allRoomCodes[i];
      const result = results?.[i];

      // Type guard: Check if result is a valid array with 2 elements
      if (!result || !Array.isArray(result) || result.length !== 2) {
        // If result structure is unexpected, treat as orphaned
        orphanedRoomCodes.push(roomCode);
        continue;
      }

      // Safely access array elements by index with runtime type validation
      // result[0] should be Error | null, result[1] should be the number result
      const error = result[0];
      const existsValue = result[1];

      // Type guard: Check if error is null or Error instance
      const hasError = error !== null && error instanceof Error;

      // Type guard: Check if existsValue is a number
      const exists = typeof existsValue === 'number' ? existsValue : null;

      // Check for errors first, then check if key exists (1 means key exists)
      if (!hasError && exists === 1) {
        validRoomCodes.push(roomCode);
      } else {
        orphanedRoomCodes.push(roomCode);
      }
    }

    // Remove orphaned rooms from the set in batch
    if (orphanedRoomCodes.length > 0) {
      await redis.sRem(ROOMS_SET, orphanedRoomCodes);
    }

    return validRoomCodes.length;
  } catch (error) {
    console.error('Error cleaning orphaned rooms:', error);
    // Fallback to set cardinality if cleanup fails
    return await redis.sCard(ROOMS_SET);
  }
}

