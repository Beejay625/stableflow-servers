/**
 * Test script for Blockradar webhook
 * 
 * This script generates a valid signature for a test payload and sends it to your webhook endpoint.
 * Run with: node src/scripts/test-blockradar-webhook.js
 * 
 * Make sure to set the BLOCKRADAR_API_KEY environment variable before running.
 */

const crypto = require('crypto');
const axios = require('axios');
require('dotenv').config(); // Load environment variables from .env file

// Your Blockradar API key - make sure this environment variable is set
const apiKey = process.env.BLOCKRADAR_API_KEY;

if (!apiKey) {
  console.error('ERROR: BLOCKRADAR_API_KEY environment variable is not set.');
  console.error('Please set it in your .env file or export it before running this script.');
  process.exit(1);
}

// The webhook URL - change this to your actual URL
const webhookUrl = process.argv[2] || 'http://localhost:3000/api/v1/wallet/webhook/blockradar';

// Create a test payload
const payload = {
  data: {
    id: "test-transaction-" + Math.floor(Math.random() * 1000000),
    recipientAddress: "0x123456789abcdef",
    amount: "0.05",
    currency: "ETH",
    status: "confirmed",
    hash: "0x" + crypto.randomBytes(32).toString('hex'),
    network: "ethereum",
    blockNumber: 123456789
  },
  event: "transaction.confirmed"
};

// Add debug flag for development environments
if (process.env.NODE_ENV === 'development') {
  payload.debug = true;
}

// Generate the signature using the same method as the webhook service
const signature = crypto
  .createHmac('sha512', apiKey)
  .update(JSON.stringify(payload))
  .digest('hex');

console.log('Generated payload:', JSON.stringify(payload, null, 2));
console.log('Generated signature (first 20 chars):', signature.substring(0, 20) + '...');

// Send request with the x-blockradar-signature header
const headers = {
  'Content-Type': 'application/json',
  'x-blockradar-signature': signature
};

// Now send the request with the proper signature
axios.post(webhookUrl, payload, { headers })
  .then(response => {
    console.log('Response status:', response.status);
    console.log('Response data:', response.data);
    console.log('Webhook test successful! ✅');
  })
  .catch(error => {
    console.error('Error status:', error.response?.status);
    console.error('Error data:', error.response?.data);
    console.error('Full error:', error.message);
    console.log('Webhook test failed! ❌');
  }); 