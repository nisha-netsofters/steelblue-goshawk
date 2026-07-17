const express = require("express");
const { verifyAuth } = require("../middleware/auth");
const {
  getConfig,
  saveConfig,
  getLogs,
} = require("../controllerV2/welcomeWhatsapp");

const router = express.Router();

router.get("/welcomeWhatsapp/config", verifyAuth, getConfig);
router.put("/welcomeWhatsapp/config", verifyAuth, saveConfig);
router.get("/welcomeWhatsapp/logs", verifyAuth, getLogs);

module.exports = router;
