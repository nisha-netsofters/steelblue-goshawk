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

// Load each route file independently — one broken file must not kill all APIs
const routesDir = path.join(__dirname, "routes-V2");
try {
  fs.readdirSync(routesDir)
    .filter((file) => file.endsWith(".js"))
    .forEach((file) => {
      const routePath = path.join(routesDir, file);
      try {
        const router = require(routePath);
        app.use("/api", router);
        app.use("/api/v2", router);
        console.log("Loaded route:", file);
      } catch (fileErr) {
        console.error("Failed to load route file:", file, fileErr?.message || fileErr);
      }
    });
} catch (err) {
  console.error("Failed to read routes-V2:", err.message);
}

/** Self-contained favorites toggle — works even if controller/route files fail to load */
const registerFavoriteToggle = () => {
  let verifyAuth;
  try {
    verifyAuth = require("./middleware/auth").verifyAuth;
  } catch (e) {
    console.error("verifyAuth missing for favorites:", e.message);
    verifyAuth = (req, res, next) => next();
  }

  const toggleHandler = async (req, res) => {
    try {
      const Saved_candidates = require("./models-v2/savedCandidates_Mongoose");
      const { candidateId } = req.body || {};
      const userId =
        req.headers.userid ||
        req.headers.userId ||
        req.user?.id ||
        req.user?.userId;
      const agencyId =
        req.headers["agencyid"] ||
        req.headers.agencyId ||
        req.user?.agencyId;

      if (!candidateId || !userId) {
        return res.status(400).json({ msg: "candidateId is required" });
      }

      const matchQuery = {
        candidateId: String(candidateId),
        userId: String(userId),
      };
      if (agencyId) matchQuery.agencyId = String(agencyId);

      const existing = await Saved_candidates.findOne(matchQuery);
      if (existing) {
        await Saved_candidates.deleteOne({
          $or: [{ id: String(existing.id) }, { _id: existing._id }],
        });
        return res.status(200).json({
          isSaved: false,
          msg: "Removed from favorites",
        });
      }

      const objectid = new mongoose.Types.ObjectId();
      const savedCandidate = await Saved_candidates.create({
        id: String(objectid),
        _id: objectid,
        candidateId: String(candidateId),
        userId: String(userId),
        ...(agencyId ? { agencyId: String(agencyId) } : {}),
      });

      return res.status(200).json({
        isSaved: true,
        savedCandidate,
        msg: "Added to favorites",
      });
    } catch (err) {
      console.info("toggle-favorite inline handler =>", err);
      return res.status(500).json({ msg: "Something went wrong" });
    }
  };

  const checkHandler = (req, res) => {
    res.json({
      status: "ok",
      route: "/api/candidate/toggle-favorite",
      method: "POST",
      via: "app.js-inline",
      time: new Date().toISOString(),
    });
  };

  // Multiple aliases — Hostinger / old proxies sometimes miss one path
  const postPaths = [
    "/api/candidate/toggle-favorite",
    "/api/v2/candidate/toggle-favorite",
    "/api/candidate/favorite",
    "/api/v2/candidate/favorite",
    "/api/candidates/toggle-favorite",
  ];
  postPaths.forEach((p) => app.post(p, verifyAuth, toggleHandler));

  app.get("/api/candidate/toggle-favorite-check", checkHandler);
  app.get("/api/candidate/favorite-check", checkHandler);
  app.get("/api/candidate/toggle-favorite", (req, res) => {
    res.json({
      status: "ok",
      message: "toggle-favorite route is live. Use POST from the app (star click).",
      method: "POST",
      time: new Date().toISOString(),
    });
  });
  app.get("/api/candidate/favorite", (req, res) => {
    res.json({
      status: "ok",
      message: "favorite alias is live. Use POST.",
      method: "POST",
      time: new Date().toISOString(),
    });
  });

  console.log("Favorites toggle routes registered (inline)");
};

try {
  registerFavoriteToggle();
} catch (err) {
  console.error("Failed to register toggle-favorite route:", err.message);
}

module.exports = app;
