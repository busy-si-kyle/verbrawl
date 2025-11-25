// app/api/player-count/remove/route.ts
import { NextRequest } from 'next/server';
import { getRedisClient } from '@/lib/redis';
import { PLAYER_COUNT_CHANNEL } from '@/lib/player-count-constants';

const SESSION_PREFIX = 'session:';
const ACTIVE_SESSIONS_SET = 'active_sessions';

export async function POST(request: NextRequest) {
  const redis = getRedisClient();

  // Ensure Redis is connected
  if (!redis.isOpen) {
    await redis.connect();
  }

  try {
    const sessionId = request.headers.get('x-session-id');
    if (!sessionId) {
      return new Response(JSON.stringify({ success: false, error: 'No session ID provided' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const sessionKey = `${SESSION_PREFIX}${sessionId}`;

    // Remove session from the active sessions set (ZSET)
    await redis.zRem(ACTIVE_SESSIONS_SET, sessionId);

    // Notify subscribers that count changed
    await redis.publish(PLAYER_COUNT_CHANNEL, JSON.stringify({
      timestamp: Date.now()
    }));

    // No need to delete individual key as we don't use it anymore

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error removing session:', error);
    return new Response(JSON.stringify({ success: false, error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}