#!/bin/bash
# NicheGate Deploy Script

echo "🚀 Deploying NicheGate..."

# Install dependencies
npm install

# Setup database
node server/setup.js

# Create logs dir
mkdir -p logs

# Start with PM2
pm2 start ecosystem.config.js
pm2 save

echo "✅ Deployed! Server running on http://localhost:5000"
echo "📊 Monitor: pm2 monit"
echo "📋 Logs: pm2 logs nichegate"
