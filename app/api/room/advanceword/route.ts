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

        // Ensure Redis connection is established
        if (!redis.isOpen) {
            await redis.connect();
        }

        // Use Redis WATCH/MULTI/EXEC for atomic transaction to prevent race conditions
        // This ensures only one player can advance the word at a time
        const maxRetries = 3;
        let retries = 0;
        let transactionSuccess = false;

        // Store the original word index from the first read (before any processing)
        // This is used to detect if the word advanced between our first read and retry
        let originalWordIndex: number | null = null;

        while (retries < maxRetries && !transactionSuccess) {
            try {
                // Watch the room key for changes
                await redis.watch(`${ROOM_PREFIX}${roomCode}`);

                // Get room data
                const roomDataString = await redis.get(`${ROOM_PREFIX}${roomCode}`);

                if (!roomDataString) {
                    await redis.unwatch();
                    return new Response(JSON.stringify({ error: 'Room not found' }), {
                        status: 404,
                        headers: { 'Content-Type': 'application/json' },
                    });
                }

                const roomData = JSON.parse(roomDataString);

                // Check if player is in the room
                if (!roomData.players.includes(playerId)) {
                    await redis.unwatch();
                    return new Response(JSON.stringify({ error: 'Player not in this room' }), {
                        status: 400,
                        headers: { 'Content-Type': 'application/json' },
                    });
                }

                // Store the current word index we're working with
                const currentIndex = Number(roomData.currentWordIndex) || 0;
                
                // On first read, store the original word index
                if (originalWordIndex === null) {
                    originalWordIndex = currentIndex;
                }
                
                // CRITICAL: If this is a correct guess and the word has already advanced
                // beyond the original index, another player already processed it.
                // We must check this BEFORE awarding any points.
                if (success && originalWordIndex !== null && currentIndex > originalWordIndex) {
                    await redis.unwatch();
                    return new Response(JSON.stringify({ 
                        error: 'Word already advanced by opponent',
                        alreadyAdvanced: true,
                        currentWordIndex: currentIndex
                    }), {
                        status: 409, // Conflict
                        headers: { 'Content-Type': 'application/json' },
                    });
                }

                // Initialize scores if not existing
                if (!roomData.scores) {
                    roomData.scores = {};
                }

                // Award point based on success/failure
                // NOTE: This will only execute if the word hasn't advanced yet
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
                roomData.currentWordIndex = currentIndex + 1;

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

                // Execute transaction atomically
                // We verify the word index hasn't changed by checking it in the transaction
                const multi = redis.multi();
                
                // First, verify the word index is still what we expect (additional safety check)
                // We can't do a conditional SET in Redis directly, but WATCH will catch changes
                multi.setEx(`${ROOM_PREFIX}${roomCode}`, ROOM_TTL, JSON.stringify(roomData));
                multi.zAdd(ROOMS_SET, {
                    score: Date.now(),
                    value: roomCode
                });
                
                const results = await multi.exec();

                // If exec returns null, the watched key was modified (transaction failed)
                if (results === null) {
                    await redis.unwatch();
                    
                    // Re-read room data to check what changed
                    const updatedRoomDataString = await redis.get(`${ROOM_PREFIX}${roomCode}`);
                    if (updatedRoomDataString) {
                        const updatedRoomData = JSON.parse(updatedRoomDataString);
                        const updatedIndex = Number(updatedRoomData.currentWordIndex) || 0;
                        
                        // CRITICAL: If this was a correct guess and the word has already advanced,
                        // the opponent got there first - immediately return conflict, do NOT retry
                        if (success && originalWordIndex !== null && updatedIndex > originalWordIndex) {
                            return new Response(JSON.stringify({ 
                                error: 'Word already advanced by opponent',
                                alreadyAdvanced: true,
                                currentWordIndex: updatedIndex
                            }), {
                                status: 409, // Conflict
                                headers: { 'Content-Type': 'application/json' },
                            });
                        }
                    }
                    
                    // Transaction failed but word didn't advance (or it's a failure case)
                    // Retry with exponential backoff
                    retries++;
                    if (retries >= maxRetries) {
                        // Exhausted retries
                        return new Response(JSON.stringify({ 
                            error: 'Could not process guess due to concurrent updates',
                            alreadyAdvanced: false
                        }), {
                            status: 409, // Conflict
                            headers: { 'Content-Type': 'application/json' },
                        });
                    }
                    
                    // Small delay before retry to avoid thundering herd
                    await new Promise(resolve => setTimeout(resolve, 10 * retries));
                    continue;
                }

                // Transaction succeeded
                transactionSuccess = true;

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
                await redis.unwatch();
                throw error;
            }
        }

        // If we exhausted retries, return an error
        return new Response(JSON.stringify({ 
            error: 'Could not advance word due to concurrent updates. Please try again.',
            alreadyAdvanced: true
        }), {
            status: 409, // Conflict
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
