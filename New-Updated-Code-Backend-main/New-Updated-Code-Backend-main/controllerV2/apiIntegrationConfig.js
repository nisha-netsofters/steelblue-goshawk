const ApiIntegrationConfig = require("../models-v2/apiIntegrationConfig_Mongoose");
const {
  CONFIG_ID,
  OCR_PROVIDERS,
  AI_PROVIDERS,
  invalidateCache,
  getApiIntegrationConfig,
  mergeProviderSecrets,
  getResumeExtractionStatus,
} = require("../middleware/apiIntegration/configResolver");

const mergeProviders = (incomingProviders, existingProviders, providerKeys) => {
  const merged = { ...existingProviders };

  providerKeys.forEach((key) => {
    merged[key] = mergeProviderSecrets(
      incomingProviders?.[key],
      existingProviders?.[key]
    );
  });

  return merged;
};

exports.getConfig = async (req, res) => {
  try {
    const config = await getApiIntegrationConfig({ maskSecrets: true });
    res.json(config);
  } catch (error) {
    console.info("getApiIntegrationConfig error =>", error);
    res.status(500).json({ error: "Failed to fetch API integration config" });
  }
};

exports.saveConfig = async (req, res) => {
  try {
    const { ocr, ai, notifications } = req.body;

    const existing = await ApiIntegrationConfig.findOne({ id: CONFIG_ID }).lean();

    const updateData = {
      ocr: {
        isEnabled: Boolean(ocr?.isEnabled),
        activeProvider: OCR_PROVIDERS.includes(ocr?.activeProvider)
          ? ocr.activeProvider
          : "google_vision",
        providers: mergeProviders(
          ocr?.providers,
          existing?.ocr?.providers,
          OCR_PROVIDERS
        ),
      },
      ai: {
        isEnabled: Boolean(ai?.isEnabled),
        activeProvider: AI_PROVIDERS.includes(ai?.activeProvider)
          ? ai.activeProvider
          : "openai",
        providers: mergeProviders(
          ai?.providers,
          existing?.ai?.providers,
          AI_PROVIDERS
        ),
      },
    };

    if (notifications !== undefined) {
      updateData.notifications = {
        isEnabled: Boolean(notifications?.isEnabled),
        whatsapp: mergeProviderSecrets(
          notifications?.whatsapp,
          existing?.notifications?.whatsapp
        ),
      };
    }

    if (updateData.ocr.isEnabled) {
      const activeOcr = updateData.ocr.providers[updateData.ocr.activeProvider];
      if (activeOcr) {
        activeOcr.isEnabled = true;
      }
    }

    if (updateData.ai.isEnabled) {
      const activeAi = updateData.ai.providers[updateData.ai.activeProvider];
      if (activeAi) {
        activeAi.isEnabled = true;
      }
    }

    const config = await ApiIntegrationConfig.findOneAndUpdate(
      { id: CONFIG_ID },
      { $set: updateData, $setOnInsert: { id: CONFIG_ID } },
      { new: true, upsert: true }
    );

    invalidateCache();

    const responseConfig = await getApiIntegrationConfig({
      bypassCache: true,
      maskSecrets: true,
    });

    res.json({ msg: "success", data: responseConfig || config });
  } catch (error) {
    console.info("saveApiIntegrationConfig error =>", error);
    res.status(500).json({ error: "Failed to save API integration config" });
  }
};

exports.getActiveProviders = async (req, res) => {
  try {
    const config = await getApiIntegrationConfig();
    const resumeExtraction = await getResumeExtractionStatus();

    res.json({
      ocr: config?.ocr?.isEnabled
        ? {
            provider: config.ocr.activeProvider,
            label: config.ocr.activeProvider,
          }
        : null,
      ai: config?.ai?.isEnabled
        ? {
            provider: config.ai.activeProvider,
            label: config.ai.activeProvider,
          }
        : null,
      notifications: config?.notifications?.isEnabled
        ? { whatsapp: config.notifications.whatsapp?.isEnabled }
        : null,
      resumeExtraction,
    });
  } catch (error) {
    console.info("getActiveProviders error =>", error);
    res.status(500).json({ error: "Failed to fetch active providers" });
  }
};
