import * as fs from 'fs';
import * as path from 'path';
import { config } from 'dotenv';

// Load environment variables based on NODE_ENV
const nodeEnv = process.env.NODE_ENV || 'development';
const envPath = path.resolve(process.cwd(), `.env.${nodeEnv}`);
console.log(`Loading environment variables from ${envPath}`);
config({ path: envPath });
console.log(`Application running in ${nodeEnv.toUpperCase()} mode`);

/**
 * Script to extract transaction ID from Blockradar webhook payload
 * 
 * Usage: npx ts-node src/scripts/extract-transaction-id.ts [payloadFile]
 * 
 * If no file is provided, it will use the example payload embedded in the script
 * Example: 
 * - npx ts-node src/scripts/extract-transaction-id.ts payload.json
 */

// Example webhook payload based on the received data
const examplePayload = {
  "event": "deposit.swept.success",
  "data": {
    "id": "8c392ba5-253f-4148-aa8e-b58b4a265ef6",
    "reference": "LIavMxKnyx",
    "senderAddress": "0x0459c0bec79A74b4d8afBB8E6B6341493874Fc0F",
    "recipientAddress": "0xA113730b79eceACe6757f80ccd185d9Ab8E98897",
    "tokenAddress": "0x337610d27c682E347C9cD60BD4b3b107C9d34dDd",
    "amount": "0.2",
    "amountPaid": "0.2",
    "fee": null,
    "currency": "USD",
    "status": "SUCCESS",
    "type": "DEPOSIT",
    "hash": "0xb5475398e1187b30c93bab1f862b4db514f95cb4da199aeb0715f2e3ab6f90fc",
    "metadata": {
      "user_id": "844466d1-f72c-4d66-a9e3-1c9806098ac4",
      "business_id": "d2ab9322-d250-4fdc-97de-463b13fa9338"
    }
  }
};

/**
 * Function to extract all important data from the webhook payload in a single pass
 * 
 * @param payload - The webhook payload object
 * @returns Object containing transactionId, recipientAddress, and eventType
 */
function extractWebhookData(payload: any): { 
  transactionId: string | null; 
  recipientAddress: string | null;
  eventType: string | null;
} {
  try {
    let transactionId = null;
    let recipientAddress = null;
    let eventType = null;
    
    // Extract transaction ID
    if (payload?.data?.id) {
      transactionId = payload.data.id;
    } else if (payload?.id) {
      transactionId = payload.id;
    } else if (payload?.transactionId) {
      transactionId = payload.transactionId;
    } else if (payload?.transaction?.id) {
      transactionId = payload.transaction.id;
    }
    
    // Extract recipient address
    if (payload?.data?.recipientAddress) {
      recipientAddress = payload.data.recipientAddress;
    } else if (payload?.recipientAddress) {
      recipientAddress = payload.recipientAddress;
    } else if (payload?.recipient) {
      recipientAddress = payload.recipient;
    } else if (payload?.transaction?.recipientAddress) {
      recipientAddress = payload.transaction.recipientAddress;
    }
    
    // Extract event type
    if (payload?.event) {
      eventType = payload.event;
    } else if (payload?.type) {
      eventType = payload.type;
    } else if (payload?.eventType) {
      eventType = payload.eventType;
    } else if (payload?.data?.event) {
      eventType = payload.data.event;
    }
    
    // Log any missing fields
    if (!transactionId) {
      console.error('No transaction ID found in the payload');
    }
    
    if (!recipientAddress) {
      console.error('No recipient address found in the payload');
    }
    
    if (!eventType) {
      console.error('No event type found in the payload');
    }
    
    return {
      transactionId,
      recipientAddress,
      eventType
    };
  } catch (error) {
    console.error('Error extracting webhook data:', error.message);
    return {
      transactionId: null,
      recipientAddress: null,
      eventType: null
    };
  }
}

async function main() {
  // Get payload file path from command line arguments or use example payload
  const payloadFilePath = process.argv[2];
  let payload;
  
  if (payloadFilePath) {
    try {
      const fullPath = path.resolve(process.cwd(), payloadFilePath);
      console.log(`Reading payload from file: ${fullPath}`);
      const fileContent = fs.readFileSync(fullPath, 'utf8');
      payload = JSON.parse(fileContent);
    } catch (error) {
      console.error(`Error reading/parsing payload file: ${error.message}`);
      console.log('Using example payload instead');
      payload = examplePayload;
    }
  } else {
    console.log('No payload file provided, using example payload');
    payload = examplePayload;
  }
  
  // Extract all data from the payload in a single pass
  const { transactionId, recipientAddress, eventType } = extractWebhookData(payload);
  
  // Display results
  console.log('\n===== WEBHOOK DATA EXTRACTED =====');
  
  if (transactionId) {
    console.log(`Transaction ID: ${transactionId}`);
    
    // Add transaction ID to clipboard if running on a compatible OS 
    try {
      const { execSync } = require('child_process');
      
      if (process.platform === 'darwin') {
        // macOS
        execSync(`echo "${transactionId}" | pbcopy`);
        console.log('(ID copied to clipboard)');
      } else if (process.platform === 'win32') {
        // Windows
        execSync(`echo ${transactionId} | clip`);
        console.log('(ID copied to clipboard)');
      } else if (process.platform === 'linux') {
        // Linux (with xclip installed)
        try {
          execSync(`echo "${transactionId}" | xclip -selection clipboard`);
          console.log('(ID copied to clipboard)');
        } catch (e) {
          // xclip might not be installed
        }
      }
    } catch (error) {
      // Clipboard functionality is optional
    }
    
    console.log('\nTo query transaction details, run:');
    console.log(`npx ts-node src/scripts/test-transaction-details.ts ${transactionId}`);
  } else {
    console.error('Failed to extract transaction ID from payload');
  }
  
  if (recipientAddress) {
    console.log(`Recipient Address: ${recipientAddress}`);
  } else {
    console.error('Failed to extract recipient address from payload');
  }
  
  if (eventType) {
    console.log(`Event Type: ${eventType}`);
  } else {
    console.error('Failed to extract event type from payload');
  }
  
  // Exit with error code if transaction ID wasn't found (as it's critical)
  if (!transactionId) {
    process.exit(1);
  }
}

// Run the script
main(); 