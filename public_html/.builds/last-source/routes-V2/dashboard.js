const {
  statistics,
  recruitorsWork,
  todayInterviews,
  candidates,
  interviews,
} = require("../controllerV2/dashboard");
const { verifyAuth } = require("../middleware/auth");

const router = require("express").Router();

// router.post("/dashboard", dashboard);
router.post("/dashboard/recruitorsWork", verifyAuth, recruitorsWork);
router.post("/dashboard/interviews", verifyAuth, interviews);
router.post("/dashboard/todayInterviews", verifyAuth, todayInterviews);
router.post("/dashboard/candidates", verifyAuth, candidates);
router.post("/dashboard/statistics", verifyAuth, statistics);

module.exports = router;
