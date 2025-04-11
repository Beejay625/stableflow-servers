import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

/**
 * Load the appropriate environment file based on NODE_ENV
 * - development: .env.development
 * - staging: .env.staging
 * - production: .env
 */
function loadEnvFile() {
  const environment = process.env.NODE_ENV || "development";
  let envFilePath;

  // Determine which env file to use based on environment
  switch (environment) {
    case "development":
      envFilePath = path.resolve(process.cwd(), ".env.development");
      break;
    case "staging":
      envFilePath = path.resolve(process.cwd(), ".env.staging");
      break;
    case "production":
      envFilePath = path.resolve(process.cwd(), ".env");
      break;
  }

  // Check if the environment file exists
  const envFileExists = fs.existsSync(envFilePath);

  if (envFileExists) {
    console.log(
      `[ENV CONFIG] Loading environment variables from ${envFilePath}`,
    );
    console.log(`[ENV CONFIG] NODE_ENV=${environment}`);

    // Clear any previously loaded env vars that might interfere
    Object.keys(process.env).forEach((key) => {
      if (!["PATH", "NODE_ENV", "PWD", "HOME", "SHELL"].includes(key)) {
        delete process.env[key];
      }
    });

    // Load the environment file
    dotenv.config({ path: envFilePath });

    // Force set NODE_ENV to match our intended environment
    process.env.NODE_ENV = environment;
  } else {
    console.error(
      `[ENV CONFIG] ERROR: Environment file ${envFilePath} not found. Application cannot start.`,
    );
    process.exit(1); // Exit the application if environment file is missing
  }

  console.log(
    `[ENV CONFIG] Application running in ${process.env.NODE_ENV} mode`,
  );
  console.log(
    `[ENV CONFIG] DB_HOST=${process.env.DATABASE_URL?.split("@")[1]?.split("/")[0]}`,
  );
  console.log(`[ENV CONFIG] REDIS_HOST=${process.env.REDIS_HOST}`);
}

// Load environment variables
loadEnvFile();

// Export a function that returns the configuration object
export default () => ({
  env: process.env.NODE_ENV,

  // Database configuration - only use DATABASE_URL
  db: {
    url: process.env.DATABASE_URL,
  },

  // Redis configuration
  redis: {
    host: process.env.REDIS_HOST,
    port: parseInt(process.env.REDIS_PORT, 10),
    password: process.env.REDIS_PASSWORD,
    restUrl: process.env.UPSTASH_REDIS_REST_URL,
    restToken: process.env.UPSTASH_REDIS_REST_TOKEN,
  },

  // OTP configuration
  otp: {
    length: parseInt(process.env.OTP_LENGTH, 10),
    expirationMs: parseInt(process.env.OTP_EXPIRATION_MS, 10),
    expirationMinutes: parseInt(process.env.OTP_EXPIRATION_MINUTES, 10),
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
    paycrest: process.env.PAYCREST_API,
  },

  // Authentication and security
  security: {
    jwtSecret: process.env.JWT_SECRET,
    encryptionKey: process.env.ENCRYPTION_KEY,
    jwtExpiration: process.env.JWT_EXPIRATION,
  },

  // Blockradar API configuration
  blockradar: {
    network: process.env.NETWORK,
  },

  // Paycrest API configuration
  paycrest: {
    apiKey: process.env.PAYCREST_API,
    baseUrl: process.env.PAYCREST_BASE_URL,
    senderFeeRecipient: process.env.SENDER_FEE_RECIPIENT,
    senderFeeAmount: process.env.SENDER_FEE_AMOUNT,
  },

  // BEP20 USDT configuration
  bep20usdt: {
    apiKey: process.env.BEP20_USDT_API_KEY,
    walletId: process.env.BEP20_USDT_WALLET_ID,
  },

  // USDC on Base chain configuration
  usdcbase: {
    apiKey: process.env.USDC_BASE_API_KEY,
    walletId: process.env.USDC_BASE_WALLET_ID,
  },

  // Tron USDT configuration
  tronusdt: {
    apiKey: process.env.BLOCKRADAR_API_KEY,
    walletId: process.env.WALLET_ID,
  },
});
