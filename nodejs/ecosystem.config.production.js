module.exports = {
  apps: [
    {
      name: "uniqueworld-backend-production",
      script: "./server.js",

      // ---- PERFORMANCE ----
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      max_memory_restart: "1048M",  // Slightly higher for production
      kill_timeout: 5000,

      // ---- LOGGING ----
      merge_logs: true,
      time: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      error_file: "./logs/pm2/error.log",
      out_file: "./logs/pm2/output.log",

      // ---- WATCH & IGNORE ----
      watch: false,
      ignore_watch: ["node_modules", "logs"],

      // ---- ENVIRONMENT ----
      env_production: {
        NODE_ENV: "production",
        PORT: 7001,
      }
    }
  ],
};

