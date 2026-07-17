const router = require("express").Router();
const {
  getallPlanFeatures,
  createPlanFetures,
} = require("../controllers/planFeatures");

router.get("/planfeature/features", getallPlanFeatures);
router.post("/planfeature/create", createPlanFetures);

module.exports = router;
