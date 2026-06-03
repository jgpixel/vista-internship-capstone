import redisClient from '../config/redis.js';

const UPCOMING_POSTS_TTL_SECONDS = 60;

export function getUpcomingPostsCacheKey(userId) {
  return `upcoming-posts:user:${userId}`;
}

export async function getCachedUpcomingPosts(userId) {
  const cacheKey = getUpcomingPostsCacheKey(userId);
  const cachedValue = await redisClient.get(cacheKey);

  if (!cachedValue) {
    return null;
  }

  return JSON.parse(cachedValue);
}

export async function setCachedUpcomingPosts(userId, posts) {
  const cacheKey = getUpcomingPostsCacheKey(userId);

  await redisClient.set(cacheKey, JSON.stringify(posts), {
    EX: UPCOMING_POSTS_TTL_SECONDS
  });
}

export async function invalidateUpcomingPostsCache(userId) {
  const cacheKey = getUpcomingPostsCacheKey(userId);

  await redisClient.del(cacheKey);
}