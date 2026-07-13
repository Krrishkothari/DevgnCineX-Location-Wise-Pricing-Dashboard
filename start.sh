#!/bin/bash
set -e

echo "Starting DevgnCineX Pricing Dashboard..."

# Start the backend server (which also initializes the BullMQ scraper worker)
cd backend
npm start
