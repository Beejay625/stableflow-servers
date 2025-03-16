import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

// Load environment-specific .env file
const environment = process.env.NODE_ENV || 'development';
const envPath = path.resolve(process.cwd(), `.env${environment !== 'production' ? '.' + environment : ''}`);

// Check if the environment file exists
const envFileExists = fs.existsSync(envPath);

// If environment-specific file exists, load it, otherwise fall back to .env
if (envFileExists) {
  console.log(`Loading environment variables from ${envPath}`);
  dotenv.config({ path: envPath });
} else {
  console.log(`Environment file ${envPath} not found. Falling back to .env`);
  dotenv.config();
}

const config = {
  env: process.env.NODE_ENV || 'development',
  
  // Database configuration
  db: {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432', 10),
    name: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    user: process.env.DB_USER,
    url: process.env.DATABASE_URL,
  },
  
  // Redis configuration
  redis: {
    host: process.env.REDIS_HOST,
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
    restUrl: process.env.UPSTASH_REDIS_REST_URL,
    restToken: process.env.UPSTASH_REDIS_REST_TOKEN,
  },
  
  // OTP configuration
  otp: {
    length: parseInt(process.env.OTP_LENGTH || '6', 10),
    expirationMs: parseInt(process.env.OTP_EXPIRATION_MS || '300000', 10),
    expirationMinutes: parseInt(process.env.OTP_EXPIRATION_MINUTES || '5', 10),
  },
  
  // Email configuration (no-reply)
  email: {
    host: process.env.NOREPLY_HOST,
    username: process.env.NOREPLY_USERNAME,
    password: process.env.NOREPLY_PASSWORD,
    email: process.env.NOREPLY_EMAIL,
  },
  
  // External API keys
  apiKeys: {
    alchemy: process.env.ALCHEMY_API_KEY,
  },
  
  // Authentication and security
  security: {
    jwtSecret: process.env.JWT_SECRET,
    encryptionKey: process.env.ENCRYPTION_KEY,
  },
};

export default config;
