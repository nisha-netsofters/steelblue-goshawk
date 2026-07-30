const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();

let verifyAuth;
try {
  verifyAuth = require("../middleware/auth").verifyAuth;
} catch (e) {
  verifyAuth = (req, res, next) => next();
}

const toggleHandler = async (req, res) => {
  try {
    const Saved_candidates = require("../models-v2/savedCandidates_Mongoose");
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

    let existing = await Saved_candidates.findOne(matchQuery);
    if (!existing) {
      existing = await Saved_candidates.findOne({
        candidateId: String(candidateId),
        userId: String(userId),
      });
    }
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
    console.info("favoriteToggle.js handler =>", err);
    return res.status(500).json({ msg: "Something went wrong" });
  }
};

router.post("/candidate/toggle-favorite", verifyAuth, toggleHandler);
router.post("/candidate/favorite", verifyAuth, toggleHandler);
router.post("/candidates/toggle-favorite", verifyAuth, toggleHandler);

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
