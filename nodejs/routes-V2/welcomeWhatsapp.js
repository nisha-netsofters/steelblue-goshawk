const express = require("express");
const { verifyAuth } = require("../middleware/auth");
const {
  getConfig,
  saveConfig,
  getLogs,
  deleteLogs,
  clearLogs,
  uploadImage,
} = require("../controllerV2/welcomeWhatsapp");

const router = express.Router();

router.get("/welcomeWhatsapp/config", verifyAuth, getConfig);
router.put("/welcomeWhatsapp/config", verifyAuth, saveConfig);
router.get("/welcomeWhatsapp/logs", verifyAuth, getLogs);
router.post("/welcomeWhatsapp/logs/delete", verifyAuth, deleteLogs);
router.delete("/welcomeWhatsapp/logs", verifyAuth, clearLogs);
router.post("/welcomeWhatsapp/upload-image", verifyAuth, uploadImage);

module.exports = router;
