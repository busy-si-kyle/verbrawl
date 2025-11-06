// lib/redis.ts
import { createClient, type RedisClientType } from 'redis';

let redisClient: RedisClientType | null = null;

export function getRedisClient(): RedisClientType {
  if (!redisClient) {
    redisClient = createClient({
      url: process.env.REDIS_URL,
    });

    redisClient.on('error', (err) => {
      console.error('Redis Client Error:', err);
    });
  }
  return redisClient;
}