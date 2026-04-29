import { createClient } from 'redis';
import dotenv from 'dotenv';

dotenv.config();

// Create Redis Client
// Connect to localhost:6380 since 6379 was already in use
export const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6380'
});

redisClient.on('error', (err) => console.log('Redis Client Error', err));
redisClient.on('connect', () => console.log('Redis Client Connected'));

export const initRedis = async () => {
  if (!redisClient.isOpen) {
    await redisClient.connect();
  }

  // Initialize Count-Min Sketch for trending interactions tracking
  // Width and Depth determine the accuracy vs memory usage.
  // 1000 width, 5 depth is reasonable for a POC.
  try {
    await redisClient.sendCommand(['CMS.INITBYDIM', 'interactions', '1000', '5']);
    console.log('CMS initialized for interactions');
  } catch (err: any) {
    if (!err.message.includes('CMS: key already exists')) {
      console.error('Error initializing CMS:', err);
    }
  }
};
