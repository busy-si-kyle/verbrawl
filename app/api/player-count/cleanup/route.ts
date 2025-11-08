// app/api/player-count/cleanup/route.ts
import { NextRequest } from 'next/server';
import { getRedisClient } from '@/lib/redis';
import { cleanExpiredSessions } from '@/lib/player-count-utils';

/**
 * Optional cleanup endpoint for background maintenance.
 * Can be called by cron jobs, scheduled tasks, or manually.
 * 
 * This endpoint:
 * - Validates all sessions in the active_sessions set
 * - Removes expired sessions
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
    const ACTIVE_SESSIONS_SET = 'active_sessions';
    const beforeCount = await redis.sCard(ACTIVE_SESSIONS_SET);
    
    // Run cleanup and get accurate count
    const afterCount = await cleanExpiredSessions(redis);
    
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
    console.error('Error cleaning up sessions:', error);
    return new Response(JSON.stringify({ 
      success: false,
      error: 'Internal server error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

