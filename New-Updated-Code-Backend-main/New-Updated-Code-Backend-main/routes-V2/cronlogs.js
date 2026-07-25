const { whatsappMsg } = require("../crownJob/crownJob");
const { verifyAuth } = require("../middleware/auth");

const router = require("express").Router();

router?.get("/whatsapp/msg", whatsappMsg);

module.exports = router;
