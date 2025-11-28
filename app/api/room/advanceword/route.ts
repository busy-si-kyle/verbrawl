import { NextRequest } from 'next/server';
import { getRedisClient } from '@/lib/redis';
import { ROOM_TTL } from '@/lib/constants';
import { publishRoomUpdate } from '../../../../lib/room-utils';

const ROOM_PREFIX = 'room:';
const ROOMS_SET = 'active_rooms';

export async function POST(request: NextRequest) {
    const redis = getRedisClient();

    if (!redis.isOpen) {
        await redis.connect();
    }

    try {
        const { roomCode, playerId, success, solution } = await request.json();

        if (!roomCode || !playerId || success === undefined) {
            return new Response(JSON.stringify({ error: 'Room code, player ID, and success status are required' }), {
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

        // Check if player is in the room
        if (!roomData.players.includes(playerId)) {
            return new Response(JSON.stringify({ error: 'Player not in this room' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        // Initialize scores if not existing
        if (!roomData.scores) {
            roomData.scores = {};
        }

        // Award point based on success/failure
        if (success) {
            // Player guessed correctly - award them a point
            roomData.scores[playerId] = (roomData.scores[playerId] || 0) + 1;
        } else {
            // Player failed - award point to the opponent
            const opponentId = roomData.players.find((p: string) => p !== playerId);
            if (opponentId) {
                roomData.scores[opponentId] = (roomData.scores[opponentId] || 0) + 1;
            }
        }

        // Store the action info so opponent can be notified
        roomData.lastAction = {
            playerId: playerId,
            action: success ? 'correct' : 'failed',
            solution: solution,
            timestamp: Date.now()
        };

        // Advance to next word
        roomData.currentWordIndex = (Number(roomData.currentWordIndex) || 0) + 1;

        // Check if game is over (someone reached 5 points)
        let winner = null;
        for (const pid of roomData.players) {
            if (roomData.scores[pid] >= 5) {
                winner = pid;
                roomData.gameOver = true;
                roomData.winner = winner;
                break;
            }
        }

        // Check if we've run out of words
        if (roomData.currentWordIndex >= (roomData.words?.length || 0)) {
            roomData.gameOver = true;
            // If no one has won yet, the player with the higher score wins
            if (!winner) {
                const player1 = roomData.players[0];
                const player2 = roomData.players[1];
                const score1 = roomData.scores[player1] || 0;
                const score2 = roomData.scores[player2] || 0;

                if (score1 > score2) {
                    roomData.winner = player1;
                } else if (score2 > score1) {
                    roomData.winner = player2;
                } else {
                    roomData.winner = null; // Tie
                }
            }
        }

        // Update lastActivity
        roomData.lastActivity = Date.now();

        // Update room data in Redis and refresh TTL
        await redis.setEx(`${ROOM_PREFIX}${roomCode}`, ROOM_TTL, JSON.stringify(roomData));

        // Refresh room activity score in the active_rooms ZSET so that
        // countActiveRooms uses real gameplay activity (guesses) as "keep alive"
        // instead of only join/ready events.
        await redis.zAdd(ROOMS_SET, {
            score: Date.now(),
            value: roomCode
        });

        // Publish update to subscribers (SSE clients)
        await publishRoomUpdate(roomCode, roomData);

        return new Response(JSON.stringify({
            roomCode,
            currentWordIndex: roomData.currentWordIndex,
            scores: roomData.scores,
            gameOver: roomData.gameOver,
            winner: roomData.winner,
            solution: solution || null,
            message: 'Word advanced successfully'
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });
    } catch (error) {
        console.error('Error advancing word:', error);
        return new Response(JSON.stringify({ error: 'Internal server error' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}
