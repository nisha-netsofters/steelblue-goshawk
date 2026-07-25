const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const express = require("express");
const cors = require("cors");
const fs = require("fs");
const bodyParser = require("body-parser");
const fileUpload = require("express-fileupload");
const mongoose = require("mongoose");

if (process.env.DATABASE_URL) {
  mongoose
    .connect(process.env.DATABASE_URL)
    .then(() => {
      console.log("Db connection successfully");
    })
    .catch((err) => {
      console.info("-------------------------------");
      console.info("err => ", err);
      console.info("-------------------------------");
    });
} else {
  console.error("DATABASE_URL is missing — API will start but DB calls will fail");
}

const app = express();

const allowedOrigins = [
  process.env.FRONTEND_APP_URL,
  "https://peachpuff-snail-327679.hostingersite.com",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
].filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(null, true);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "token",
      "agencyId",
      "slug",
      "userId",
      "X-Custom-Header",
    ],
  })
);

app.options("*", cors());

const healthHandler = (req, res) => {
  res.json({
    status: "ok",
    message: "API is running",
    env: process.env.NODE_ENV || "development",
    time: new Date().toISOString(),
  });
};

app.get("/api/health", healthHandler);
app.get("/health", healthHandler);

app.use(bodyParser.json());
app.use(
  bodyParser.urlencoded({
    extended: true,
    limit: "50mb",
  })
);

app.use(fileUpload());

app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Use __dirname so Hostinger cwd changes do not crash boot
const routesDir = path.join(__dirname, "routes-V2");
try {
  fs.readdirSync(routesDir)
    .filter((file) => file.endsWith(".js"))
    .forEach((file) => {
      const routePath = path.join(routesDir, file);
      app.use("/api", require(routePath));
      app.use("/api/v2", require(routePath));
    });
} catch (err) {
  console.error("Failed to load routes-V2:", err.message);
}

// crownJob.start();

module.exports = app;
