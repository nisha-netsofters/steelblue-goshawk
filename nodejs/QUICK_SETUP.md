# Quick Setup Checklist for Contabo Staging

## 🚀 Quick Start (5 minutes)

### Step 1: Server Setup (One-time)

```bash
# SSH into Contabo server
ssh user@your-contabo-server-ip

# Install Node.js 18+ (if not installed)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 globally
sudo npm install -g pm2

# Create app directory
sudo mkdir -p /var/www/uniqueworld-backend
sudo chown $USER:$USER /var/www/uniqueworld-backend

# Clone repository
cd /var/www/uniqueworld-backend
git clone <your-repo-url> .
git checkout staging  # or your branch

# Install dependencies
npm ci --production

# Setup PM2 startup
pm2 startup
# Copy and run the command shown above
```

### Step 2: Environment Variables

```bash
# Create .env file
nano .env
```

Add your environment variables (see DEPLOYMENT.md for full list):
```env
NODE_ENV=staging
DATABASE_URL=your_mongodb_connection_string
PORT=7001
POSTGRES_STAGING_HOST=your_postgres_host
POSTGRES_STAGING_PORT=your_postgres_port
POSTGRES_STAGING_USER=your_postgres_user
POSTGRES_STAGING_PASSWORD=your_postgres_password
POSTGRES_STAGING_DATABASE=your_postgres_database
# ... other variables
```

### Step 3: Initial Setup

```bash
# Run migrations
npm run staging:run-migration

# Start application
pm2 start ecosystem.config.js --env staging

# Save PM2 config
pm2 save

# Check status
pm2 list
pm2 logs uniqueworld-backend
```

### Step 4: GitHub Secrets Setup

Go to: `https://github.com/your-org/your-repo/settings/secrets/actions`

Add these secrets:
- `CONTABO_HOST` - Your server IP
- `CONTABO_USER` - SSH username (usually `root`)
- `CONTABO_SSH_KEY` - Your private SSH key (full content)
- `CONTABO_PORT` - SSH port (usually `22`)
- `CONTABO_APP_PATH` - `/var/www/uniqueworld-backend`

### Step 5: Test Deployment

```bash
# Push to staging branch
git push origin staging

# Check GitHub Actions tab for deployment status
```

## ✅ Verification

```bash
# Check if app is running
curl http://localhost:7001

# Check PM2 status
pm2 list

# View logs
pm2 logs uniqueworld-backend
```

## 🔧 Common Commands

```bash
# Manual deployment
cd /var/www/uniqueworld-backend
bash scripts/deploy.sh

# Restart app
pm2 restart uniqueworld-backend

# View logs
pm2 logs uniqueworld-backend --lines 100

# Stop app
pm2 stop uniqueworld-backend

# Run migrations manually
npm run staging:run-migration
```

## 📝 Next Steps

1. ✅ Server setup complete
2. ✅ Environment variables configured
3. ✅ GitHub Secrets added
4. ✅ First deployment successful
5. ⬜ Configure domain (optional)
6. ⬜ Setup SSL certificate (optional)
7. ⬜ Configure monitoring (optional)

## 🆘 Troubleshooting

**Deployment fails?**
- Check GitHub Actions logs
- SSH to server: `pm2 logs uniqueworld-backend`
- Verify environment variables: `pm2 env 0`

**App not starting?**
- Check port: `lsof -i :7001`
- Check database connection
- Verify .env file exists

**Need help?**
- See full guide: `DEPLOYMENT.md`
- Check PM2 docs: https://pm2.keymetrics.io/

