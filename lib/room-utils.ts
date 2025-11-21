import { getRedisClient } from './redis';

export const ROOM_UPDATES_CHANNEL_PREFIX = 'room-updates:';

export async function publishRoomUpdate(roomCode: string, roomData: any) {
    const redis = getRedisClient();

    // Ensure connection if not open (though getRedisClient usually handles this or returns a client that will connect on use)
    if (!redis.isOpen) {
        await redis.connect();
    }

    try {
        // Publish the entire room state to the channel
        await redis.publish(`${ROOM_UPDATES_CHANNEL_PREFIX}${roomCode}`, JSON.stringify(roomData));
    } catch (error) {
        console.error(`Error publishing update for room ${roomCode}:`, error);
    }
}
