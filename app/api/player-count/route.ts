// app/api/player-count/route.ts
import { NextRequest } from 'next/server';
import { getRedisClient } from '@/lib/redis';

const SESSION_PREFIX = 'session:';
const ACTIVE_SESSIONS_SET = 'active_sessions';
const SESSION_TTL = 60 * 5; // 5 minutes

export async function GET(request: NextRequest) {
  const redis = getRedisClient();
  
  // Ensure Redis is connected
  if (!redis.isOpen) {
    await redis.connect();
  }

  try {
    // Get session ID from header
    const sessionId = request.headers.get('x-session-id');
    
    // Only register session if a session ID is provided
    if (sessionId) {
      const sessionKey = `${SESSION_PREFIX}${sessionId}`;
      
      // Redis SADD will not add duplicates, so this is safe to call multiple times
      await redis.sAdd(ACTIVE_SESSIONS_SET, sessionId);
      
      // Set TTL for the individual session
      await redis.setEx(sessionKey, SESSION_TTL, 'active');
    }
    
    // Get count of active players using Redis set cardinality
    const playerCount = await redis.sCard(ACTIVE_SESSIONS_SET);
    
    return new Response(JSON.stringify({ 
      count: playerCount,
      timestamp: Date.now()
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, must-revalidate',
      },
    });
  } catch (error) {
    console.error('Error getting player count:', error);
    return new Response(JSON.stringify({ count: 0 }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }
}