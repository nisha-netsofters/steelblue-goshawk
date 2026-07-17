const express = require("express");
const { verifyAuth } = require("../middleware/auth");
const {
  getConfig,
  saveConfig,
  getActiveProviders,
} = require("../controllerV2/apiIntegrationConfig");

const router = express.Router();

router.get("/apiIntegration/config", verifyAuth, getConfig);
router.put("/apiIntegration/config", verifyAuth, saveConfig);
router.get("/apiIntegration/active", verifyAuth, getActiveProviders);

module.exports = router;
