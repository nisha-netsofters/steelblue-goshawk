const router = require("express").Router();
const {
  getallPlanFeatures,
  createPlanFetures,
} = require("../controllerV2/planFeatures");
const { verifyAuth } = require("../middleware/auth");

router.get("/planfeature/features", verifyAuth, getallPlanFeatures);
router.post("/planfeature/create", verifyAuth, createPlanFetures);

module.exports = router;
