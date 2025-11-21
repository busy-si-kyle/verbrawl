import { NextRequest } from 'next/server';
import { getRedisClient } from '@/lib/redis';
import { ROOM_TTL } from '@/lib/constants';

const ROOM_PREFIX = 'room:';
const ROOMS_SET = 'active_rooms';

export async function POST(request: NextRequest) {
    const redis = getRedisClient();

    // Ensure Redis is connected
    if (!redis.isOpen) {
        await redis.connect();
    }

    try {
        const { roomCode, playerId } = await request.json();

        if (!roomCode || !playerId) {
            return new Response(JSON.stringify({ error: 'Room code and player ID are required' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        // Get room data
        const roomDataString = await redis.get(`${ROOM_PREFIX}${roomCode}`);

        if (!roomDataString) {
            return new Response(JSON.stringify({ error: 'Room not found' }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        const roomData = JSON.parse(roomDataString);

        // Verify player is in the room
        if (!roomData.players.includes(playerId)) {
            return new Response(JSON.stringify({ error: 'Player not in this room' }), {
                status: 403,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        // Initialize readyPlayers if not present
        if (!roomData.readyPlayers) {
            roomData.readyPlayers = [];
        }

        // Add player to readyPlayers if not already there (no untoggling allowed)
        if (!roomData.readyPlayers.includes(playerId)) {
            roomData.readyPlayers.push(playerId);
        } else {
            // Player is already ready, do nothing (or return specific message if needed)
            // We are strictly enforcing "no untoggling" as per requirement
        }

        // Check if all players are ready and we have at least 2 players
        const allReady = roomData.players.length >= 2 &&
            roomData.players.every((p: string) => roomData.readyPlayers.includes(p));

        if (allReady && roomData.status === 'waiting') {
            roomData.status = 'countdown';
            roomData.countdownStart = Date.now();
            console.log(`[DEBUG] Room ${roomCode} all players ready, starting countdown at ${roomData.countdownStart}`);
        }

        // Update room data in Redis
        await redis.setEx(`${ROOM_PREFIX}${roomCode}`, ROOM_TTL, JSON.stringify(roomData));

        // Refresh room activity
        await redis.zAdd(ROOMS_SET, {
            score: Date.now(),
            value: roomCode
        });

        return new Response(JSON.stringify({
            roomCode,
            status: roomData.status,
            readyPlayers: roomData.readyPlayers,
            countdownStart: roomData.countdownStart,
            message: allReady ? 'All players ready, countdown started!' : 'Player marked as ready',
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (error) {
        console.error('Error setting ready status:', error);
        return new Response(JSON.stringify({ error: 'Internal server error' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}
