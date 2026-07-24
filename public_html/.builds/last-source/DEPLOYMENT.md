# Deployment Guide - Contabo Staging Environment

This guide explains how to set up CI/CD for deploying to your Contabo server staging environment.

## Prerequisites

1. **Contabo Server Access**
   - SSH access to your Contabo server
   - Server IP address or hostname
   - SSH private key

2. **GitHub Repository**
   - Repository with your code
   - Access to GitHub Secrets

3. **Server Requirements**
   - Node.js 18+ installed
   - PM2 installed globally (`npm install -g pm2`)
   - Git installed
   - Nginx or similar reverse proxy (optional but recommended)

## Setup Instructions

### 1. Server Initial Setup

SSH into your Contabo server and run:

```bash
# Create application directory
sudo mkdir -p /var/www/uniqueworld-backend
sudo chown $USER:$USER /var/www/uniqueworld-backend

# Clone your repository
cd /var/www/uniqueworld-backend
git clone <your-repo-url> .

# Install dependencies
npm ci --production

# Install PM2 globally if not already installed
npm install -g pm2

# Setup PM2 to start on server reboot
pm2 startup
# Follow the instructions shown by the command above
```

### 2. Environment Variables

Create a `.env` file on the server:

```bash
cd /var/www/uniqueworld-backend
nano .env
```

Add your environment variables:
```env
NODE_ENV=staging
DATABASE_URL=your_mongodb_connection_string
PORT=7001
# Add all other required environment variables
```

### 3. Database Migrations

Run initial migrations:

```bash
npm run pro:run-migration
```

### 4. Start Application

```bash
# Start with PM2
pm2 start ecosystem.config.js --env staging

# Save PM2 configuration
pm2 save
```

### 5. Configure GitHub Secrets

Go to your GitHub repository → Settings → Secrets and variables → Actions → New repository secret

Add the following secrets:

- **CONTABO_HOST**: Your Contabo server IP address or hostname
- **CONTABO_USER**: SSH username (usually `root` or your user)
- **CONTABO_SSH_KEY**: Your private SSH key (entire key including `-----BEGIN` and `-----END`)
- **CONTABO_PORT**: SSH port (usually `22`)
- **CONTABO_APP_PATH**: Application path on server (default: `/var/www/uniqueworld-backend`)

#### How to get SSH Key:

If you don't have an SSH key pair:

```bash
# On your local machine
ssh-keygen -t rsa -b 4096 -C "your_email@example.com"

# Copy public key to server
ssh-copy-id -i ~/.ssh/id_rsa.pub user@your-contabo-server

# Copy private key content for GitHub secret
cat ~/.ssh/id_rsa
```

**⚠️ Security Note**: Never commit your SSH private key to the repository. Only add it as a GitHub Secret.

### 6. Configure GitHub Actions Workflow

The workflow file (`.github/workflows/deploy-staging.yml`) is already configured. It will:

- Trigger on push to `staging` branch or your feature branch
- Install dependencies
- Run tests (if available)
- Deploy to Contabo server via SSH
- Run database migrations
- Restart PM2

### 7. Branch Strategy

The workflow is configured to deploy when you push to:
- `staging` branch
- `feat/professional-resume-enquiry` branch (your current branch)

To change the trigger branches, edit `.github/workflows/deploy-staging.yml`:

```yaml
on:
  push:
    branches:
      - staging
      - your-branch-name
```

## Deployment Process

### Automatic Deployment (CI/CD)

1. Push your code to the configured branch:
   ```bash
   git push origin staging
   ```

2. GitHub Actions will automatically:
   - Checkout code
   - Install dependencies
   - Deploy to server
   - Run migrations
   - Restart PM2

3. Check deployment status in GitHub Actions tab

### Manual Deployment

You can also deploy manually using the deployment script:

```bash
# On the server
cd /var/www/uniqueworld-backend
bash scripts/deploy.sh
```

Or manually:

```bash
cd /var/www/uniqueworld-backend
git pull origin staging
npm ci --production
npm run pro:run-migration
pm2 reload ecosystem.config.js --env staging
```

## Monitoring

### PM2 Commands

```bash
# View application status
pm2 list

# View logs
pm2 logs uniqueworld-backend

# View specific log files
tail -f /var/www/uniqueworld-backend/logs/pm2/error.log
tail -f /var/www/uniqueworld-backend/logs/pm2/output.log

# Restart application
pm2 restart uniqueworld-backend

# Stop application
pm2 stop uniqueworld-backend

# Monitor resources
pm2 monit
```

### Health Check

Test if your application is running:

```bash
curl http://localhost:7001
```

## Reverse Proxy Setup (Nginx)

If you want to use a domain name, set up Nginx:

```nginx
server {
    listen 80;
    server_name staging-api.yourdomain.com;

    location / {
        proxy_pass http://localhost:7001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

## Troubleshooting

### Deployment Fails

1. Check GitHub Actions logs for errors
2. SSH into server and check:
   ```bash
   pm2 logs uniqueworld-backend --lines 50
   ```

### Application Not Starting

1. Check environment variables:
   ```bash
   pm2 env 0
   ```

2. Check if port is in use:
   ```bash
   lsof -i :7001
   ```

3. Check database connection

### Migration Issues

```bash
# Check migration status
npm run pro:run-migration

# Rollback if needed (if knex supports it)
# You may need to manually fix database issues
```

## Security Best Practices

1. ✅ Use SSH keys instead of passwords
2. ✅ Keep `.env` file secure and never commit it
3. ✅ Use strong passwords for database
4. ✅ Keep Node.js and dependencies updated
5. ✅ Use firewall (UFW) to restrict access
6. ✅ Enable SSL/TLS for production
7. ✅ Regularly backup database

## Next Steps

- [ ] Set up production environment
- [ ] Configure domain and SSL
- [ ] Set up monitoring (e.g., PM2 Plus, Sentry)
- [ ] Configure automated backups
- [ ] Set up staging database
- [ ] Configure email service for staging

## Support

For issues or questions:
1. Check PM2 logs
2. Check GitHub Actions logs
3. Review server system logs: `journalctl -u pm2-*`

