import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Load the appropriate environment file based on NODE_ENV
 * - development: .env.development
 * - staging: .env.staging
 * - production: .env
 */
function loadEnvFile() {
  const environment = process.env.NODE_ENV || 'development';
  let envFilePath;
  
  // Determine which env file to use based on environment
  switch (environment) {
    case 'development':
      envFilePath = path.resolve(process.cwd(), '.env.development');
      break;
    case 'staging':
      envFilePath = path.resolve(process.cwd(), '.env.staging');
      break;
    case 'production':
    default:
      envFilePath = path.resolve(process.cwd(), '.env');
      break;
  }

  // Check if the environment file exists
  const envFileExists = fs.existsSync(envFilePath);

  if (envFileExists) {
    console.log(`Loading environment variables from ${envFilePath}`);
    dotenv.config({ path: envFilePath });
  } else {
    console.log(`Environment file ${envFilePath} not found. Falling back to .env`);
    dotenv.config();
  }
  
  console.log(`Application running in ${environment.toUpperCase()} mode`);
}

// Load environment variables
loadEnvFile();

// Export a function that returns the configuration object
export default () => ({
  env: process.env.NODE_ENV || 'development',
  
  // Database configuration
  db: {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432', 10),
    name: process.env.DB_NAME || process.env.DB_DATABASE,
    password: process.env.DB_PASSWORD,
    user: process.env.DB_USER || process.env.DB_USERNAME,
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
    host: process.env.NOREPLY_HOST || process.env.MAIL_HOST,
    username: process.env.NOREPLY_USERNAME || process.env.MAIL_USER,
    password: process.env.NOREPLY_PASSWORD || process.env.MAIL_PASSWORD,
    email: process.env.NOREPLY_EMAIL || process.env.MAIL_FROM,
  },
  
  // External API keys
  apiKeys: {
    alchemy: process.env.ALCHEMY_API_KEY,
    paycrest: process.env.PAYCREST_API_KEY || process.env.PAYCREST_API,
  },
  
  // Authentication and security
  security: {
    jwtSecret: process.env.JWT_SECRET,
    encryptionKey: process.env.ENCRYPTION_KEY,
    jwtExpiration: process.env.JWT_EXPIRATION || '1d',
  },
  
  // Blockradar API configuration
  blockradar: {
    apiKey: process.env.BLOCKRADAR_API_KEY,
  },
  
  // Paycrest API configuration
  paycrest: {
    apiKey: process.env.PAYCREST_API_KEY || process.env.PAYCREST_API,
    baseUrl: process.env.PAYCREST_BASE_URL || 'https://api.paycrest.io',
  }
});
