#!/bin/bash

# Deployment script for Contabo server
# This script can be run manually on the server or via CI/CD

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
APP_NAME="uniqueworld-backend"
APP_PATH="${APP_PATH:-/var/www/uniqueworld-backend}"
NODE_ENV="${NODE_ENV:-staging}"
BRANCH="${BRANCH:-staging}"

echo -e "${GREEN}Starting deployment for ${APP_NAME}...${NC}"

# Navigate to application directory
cd "$APP_PATH" || {
    echo -e "${RED}Error: Application directory not found: $APP_PATH${NC}"
    exit 1
}

# Check if git repository exists
if [ ! -d ".git" ]; then
    echo -e "${RED}Error: Not a git repository${NC}"
    exit 1
fi

# Backup current deployment
echo -e "${YELLOW}Creating backup...${NC}"
if [ -d "current" ]; then
    BACKUP_DIR="backup-$(date +%Y%m%d-%H%M%S)"
    cp -r current "$BACKUP_DIR" 2>/dev/null || true
    echo -e "${GREEN}Backup created: $BACKUP_DIR${NC}"
fi

# Pull latest code
echo -e "${YELLOW}Pulling latest code from $BRANCH...${NC}"
git fetch origin
git reset --hard "origin/$BRANCH"
git clean -fd

# Install dependencies
echo -e "${YELLOW}Installing dependencies...${NC}"
npm ci --production

# Run database migrations
echo -e "${YELLOW}Running database migrations...${NC}"
if npm run staging:run-migration 2>/dev/null; then
    echo -e "${GREEN}Migrations completed successfully${NC}"
else
    echo -e "${YELLOW}No migrations to run or migration script not found${NC}"
fi

# Create logs directory if it doesn't exist
mkdir -p logs/pm2

# Determine which ecosystem config file to use
if [ "$NODE_ENV" = "staging" ]; then
    ECOSYSTEM_FILE="ecosystem.config.staging.js"
elif [ "$NODE_ENV" = "production" ]; then
    ECOSYSTEM_FILE="ecosystem.config.production.js"
else
    ECOSYSTEM_FILE="ecosystem.config.js"
fi

# Restart application with PM2
echo -e "${YELLOW}Restarting application with PM2...${NC}"
if pm2 list | grep -q "$APP_NAME"; then
    echo -e "${GREEN}Reloading existing PM2 process...${NC}"
    pm2 reload "$ECOSYSTEM_FILE" --env "$NODE_ENV" || {
        echo -e "${RED}PM2 reload failed, trying restart...${NC}"
        pm2 restart "$ECOSYSTEM_FILE" --env "$NODE_ENV"
    }
else
    echo -e "${GREEN}Starting new PM2 process...${NC}"
    pm2 start "$ECOSYSTEM_FILE" --env "$NODE_ENV"
fi

# Save PM2 process list
pm2 save

# Show PM2 status
echo -e "${GREEN}PM2 Status:${NC}"
pm2 list

echo -e "${GREEN}✅ Deployment completed successfully!${NC}"
echo -e "${GREEN}Application is running in $NODE_ENV mode${NC}"

