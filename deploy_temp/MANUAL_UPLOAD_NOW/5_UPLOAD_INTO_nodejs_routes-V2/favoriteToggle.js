const express = require("express");
const router = express.Router();
const { verifyAuth } = require("../middleware/auth");
const {
  toggleFavoriteCandidate,
} = require("../controllerV2/saved_Candidates");

// Dedicated route file so Hostinger readdir always picks up favorites API
router.post("/candidate/toggle-favorite", verifyAuth, toggleFavoriteCandidate);
router.get("/candidate/toggle-favorite-check", (req, res) => {
  res.json({
    status: "ok",
    route: "/api/candidate/toggle-favorite",
    method: "POST",
    via: "favoriteToggle.js",
    time: new Date().toISOString(),
  });
});

module.exports = router;
