// Redis Clear Script
const Redis = require('ioredis');

// Upstash Redis configuration from .env file
const REDIS_HOST = "current-midge-61414.upstash.io";
const REDIS_PORT = 6379;
const REDIS_PASSWORD = "Ae_mAAIjcDFhZDkyOGVlOTcyMmU0MmYzYmJjMjQ4YzUxY2QwNzMzN3AxMA";

async function clearRedis() {
  console.log('Connecting to Upstash Redis...');
  console.log(`Host: ${REDIS_HOST}`);
  
  try {
    // Create Redis client with direct credentials
    const redis = new Redis({
      host: REDIS_HOST,
      port: REDIS_PORT,
      password: REDIS_PASSWORD,
      tls: {
        rejectUnauthorized: false
      }
    });
    
    // Error handling
    redis.on('error', (err) => {
      console.error('Redis connection error:', err);
      process.exit(1);
    });
    
    // Successful connection
    redis.on('connect', async () => {
      console.log('Connected to Redis successfully!');
      
      try {
        console.log('Flushing all data from Redis...');
        const result = await redis.flushall();
        console.log('Redis flush result:', result);
        
        console.log('Closing connection...');
        await redis.quit();
        console.log('Done! All Redis data has been cleared.');
      } catch (error) {
        console.error('Error while flushing Redis:', error);
        process.exit(1);
      }
    });
  } catch (error) {
    console.error('Error creating Redis client:', error);
    process.exit(1);
  }
}

clearRedis(); 