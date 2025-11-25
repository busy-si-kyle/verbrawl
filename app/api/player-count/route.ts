import { NextRequest } from 'next/server';
import { getRedisClient } from '@/lib/redis';
import { countActiveSessions } from '@/lib/player-count-utils';
import { PLAYER_COUNT_CHANNEL } from '@/lib/player-count-constants';

const ACTIVE_SESSIONS_SET = 'active_sessions';

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
      // Add to Sorted Set with current timestamp as score
      // This automatically handles updates (refreshing the timestamp)
      await redis.zAdd(ACTIVE_SESSIONS_SET, {
        score: Date.now(),
        value: sessionId
      });

      // Notify subscribers that count changed
      await redis.publish(PLAYER_COUNT_CHANNEL, JSON.stringify({
        timestamp: Date.now()
      }));
    }

    // Get the count of active sessions (automatically cleans up expired ones)
    const activeCount = await countActiveSessions(redis);

    return new Response(JSON.stringify({
      count: activeCount,
      timestamp: Date.now()
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=2', // Cache for 2 seconds to reduce load
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