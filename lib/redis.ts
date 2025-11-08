// lib/redis.ts
import { createClient, type RedisClientType } from 'redis';

let redisClient: RedisClientType | null = null;
let redisPubSubClient: RedisClientType | null = null;

export function getRedisClient(): RedisClientType {
  if (!redisClient) {
    redisClient = createClient({
      url: process.env.VERBRAWL_REDIS_URL,
    });

    redisClient.on('error', (err) => {
      console.error('Redis Client Error:', err);
    });
  }
  return redisClient;
}

export function getRedisPubSubClient(): RedisClientType {
  if (!redisPubSubClient) {
    redisPubSubClient = createClient({
      url: process.env.VERBRAWL_REDIS_URL,
    });

    redisPubSubClient.on('error', (err) => {
      console.error('Redis Pub/Sub Client Error:', err);
    });
  }
  return redisPubSubClient;
}
