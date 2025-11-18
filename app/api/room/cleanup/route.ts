// app/api/room/cleanup/route.ts
import { NextRequest } from 'next/server';
import { getRedisClient } from '@/lib/redis';
import { cleanOrphanedRooms } from '@/lib/player-count-utils';

/**
 * Optional cleanup endpoint for background maintenance.
 * Can be called by cron jobs, scheduled tasks, or manually.
 *
 * This endpoint:
 * - Validates all rooms in the active_rooms set
 * - Removes orphaned rooms (those without corresponding room data)
 * - Returns statistics about the cleanup operation
 */
export async function POST(request: NextRequest) {
  const redis = getRedisClient();

  // Ensure Redis is connected
  if (!redis.isOpen) {
    await redis.connect();
  }

  try {
    // Get count before cleanup using the same method as the cleanup function
    const ROOMS_SET = 'active_rooms';
    const beforeCount = await redis.sCard(ROOMS_SET);

    // Run cleanup and get accurate count (force cleanup for this maintenance endpoint)
    const afterCount = await cleanOrphanedRooms(redis, true);

    const cleaned = beforeCount - afterCount;

    return new Response(JSON.stringify({
      success: true,
      cleaned,
      before: beforeCount,
      after: afterCount,
      timestamp: Date.now()
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error cleaning up rooms:', error);
    return new Response(JSON.stringify({
      success: false,
      error: 'Internal server error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}