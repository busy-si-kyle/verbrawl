// app/api/player-count/remove/route.ts
import { NextRequest } from 'next/server';
import { getRedisClient } from '@/lib/redis';

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
    
    // Remove session from the active sessions set
    await redis.sRem(ACTIVE_SESSIONS_SET, sessionId);
    
    // Delete the individual session key
    await redis.del(sessionKey);
    
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