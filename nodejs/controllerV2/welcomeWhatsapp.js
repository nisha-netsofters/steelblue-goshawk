const {
  getWelcomeWhatsappConfig,
} = require("../middleware/whatsappMSG/welcomeMessage");
const WelcomeWhatsappConfig = require("../models-v2/welcomeWhatsappConfig_Mongoose");
const WelcomeWhatsappLog = require("../models-v2/welcomeWhatsappLog_Mongoose");

const CONFIG_ID = "welcome-whatsapp-config";

exports.getConfig = async (req, res) => {
  try {
    const config = await getWelcomeWhatsappConfig();
    res.json(config);
  } catch (error) {
    console.info("getWelcomeWhatsappConfig error =>", error);
    res.status(500).json({ error: "Failed to fetch welcome WhatsApp config" });
  }
};

exports.saveConfig = async (req, res) => {
  try {
    const {
      isEnabled,
      apiUrl,
      securityKey,
      messagingProduct,
      recipientType,
      messageType,
      templateName,
      templateLanguageCode,
      countryCodePrefix,
      components,
    } = req.body;

    if (
      !apiUrl ||
      !securityKey ||
      !messagingProduct ||
      !recipientType ||
      !messageType ||
      !templateName ||
      !templateLanguageCode
    ) {
      return res.status(400).json({
        error:
          "API URL, Security Key, messaging_product, recipient_type, type, template name, and language code are required",
      });
    }

    const updateData = {
      isEnabled: Boolean(isEnabled),
      apiUrl,
      securityKey,
      messagingProduct,
      recipientType,
      messageType,
      templateName,
      templateLanguageCode,
      countryCodePrefix: countryCodePrefix || "91",
      components: Array.isArray(components) ? components : [],
    };

    const config = await WelcomeWhatsappConfig.findOneAndUpdate(
      { id: CONFIG_ID },
      { $set: updateData, $setOnInsert: { id: CONFIG_ID } },
      { new: true, upsert: true }
    );

    res.json({ msg: "success", data: config });
  } catch (error) {
    console.info("saveWelcomeWhatsappConfig error =>", error);
    res.status(500).json({ error: "Failed to save welcome WhatsApp config" });
  }
};

exports.getLogs = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const perPage = parseInt(req.query.perPage, 10) || 20;
    const skip = (page - 1) * perPage;

    const [logs, total] = await Promise.all([
      WelcomeWhatsappLog.find()
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(perPage),
      WelcomeWhatsappLog.countDocuments(),
    ]);

    res.json({ data: logs, total, page, perPage });
  } catch (error) {
    console.info("getWelcomeWhatsappLogs error =>", error);
    res.status(500).json({ error: "Failed to fetch logs" });
  }
};
