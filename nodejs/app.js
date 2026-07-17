require("dotenv").config();
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const bodyParser = require("body-parser");
const fileUpload = require("express-fileupload");
const mongoose = require("mongoose");
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

const app = express();

const allowedOrigins = [
  process.env.FRONTEND_APP_URL,
  "https://peachpuff-snail-327679.hostingersite.com",
  "http://localhost:3000",
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

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", message: "API is running" });
});

app.use(bodyParser.json());
app.use(
  bodyParser.urlencoded({
    extended: true,
    limit: "50mb",
  })
);

app.use(fileUpload());

// Endpointsapp.use(express.static('public'));
app.use("/uploads", express.static("uploads"));
// fs.readdirSync("./routes").map((file) => {
//   app.use("/api", require("./routes/" + file));
// });
fs.readdirSync("./routes-V2").map((file) => {
  app.use("/api", require("./routes-V2/" + file));
  app.use("/api/v2", require("./routes-V2/" + file));
});

// crownJob.start();

module.exports = app;
