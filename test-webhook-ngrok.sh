#!/bin/bash
NGROK_URL=$(curl -s http://localhost:4040/api/tunnels | grep -o "https://[^\"]*")
echo "Your Blockradar webhook URL: ${NGROK_URL}/wallet/transaction/webhook/blockradar"
echo "Your Blockradar resend webhook URL: ${NGROK_URL}/wallet/transaction/webhook/blockradar/resend"
