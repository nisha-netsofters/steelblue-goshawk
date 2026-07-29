const ApiIntegrationConfig = require("../../models-v2/apiIntegrationConfig_Mongoose");

const CONFIG_ID = "api-integration-config";

const OCR_PROVIDERS = [
  "google_vision",
  "aws_textract",
  "azure_document_intelligence",
  "tesseract",
];

const AI_PROVIDERS = ["openai", "gemini", "claude"];

const SENSITIVE_FIELDS = [
  "apiKey",
  "secretAccessKey",
  "accessKeyId",
  "securityKey",
];

let cachedConfig = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 30 * 1000;

const maskValue = (value) => {
  if (!value) return "";
  if (value.length <= 4) return "••••";
  return `${"•".repeat(Math.min(value.length - 4, 12))}${value.slice(-4)}`;
};

const maskSensitiveFields = (obj) => {
  if (!obj || typeof obj !== "object") return obj;
  const masked = { ...obj };
  SENSITIVE_FIELDS.forEach((field) => {
    if (masked[field]) {
      masked[field] = maskValue(masked[field]);
      masked[`${field}Set`] = true;
    }
  });
  return masked;
};

const getDefaultConfig = () => ({
  id: CONFIG_ID,
  ocr: {
    isEnabled: false,
    activeProvider: "google_vision",
    providers: {
      google_vision: { isEnabled: false, apiKey: "", projectId: "" },
      aws_textract: {
        isEnabled: false,
        accessKeyId: "",
        secretAccessKey: "",
        region: "us-east-1",
      },
      azure_document_intelligence: {
        isEnabled: false,
        endpoint: "",
        apiKey: "",
      },
      tesseract: { isEnabled: false, language: "eng" },
    },
  },
  ai: {
    isEnabled: false,
    activeProvider: "openai",
    providers: {
      openai: {
        isEnabled: false,
        apiKey: "",
        model: "gpt-4o",
        baseUrl: "https://api.openai.com/v1",
      },
      gemini: { isEnabled: false, apiKey: "", model: "gemini-3.5-flash" },
      claude: {
        isEnabled: false,
        apiKey: "",
        model: "claude-3-5-sonnet-20241022",
        baseUrl: "https://api.anthropic.com/v1",
      },
    },
  },
  notifications: {
    isEnabled: false,
    whatsapp: {
      isEnabled: false,
      useWelcomeWhatsappConfig: true,
      apiUrl:
        "https://wa2.netsofters.com/api/external-api-bridge/send-message",
      securityKey: "",
    },
  },
});

const invalidateCache = () => {
  cachedConfig = null;
  cacheTimestamp = 0;
};

const getApiIntegrationConfig = async (options = {}) => {
  const { bypassCache = false, maskSecrets = false } = options;
  const now = Date.now();

  if (
    !bypassCache &&
    cachedConfig &&
    now - cacheTimestamp < CACHE_TTL_MS
  ) {
    return maskSecrets ? formatConfigForResponse(cachedConfig) : cachedConfig;
  }

  let config = await ApiIntegrationConfig.findOne({ id: CONFIG_ID }).lean();

  if (!config) {
    config = getDefaultConfig();
  }

  cachedConfig = config;
  cacheTimestamp = now;

  return maskSecrets ? formatConfigForResponse(config) : config;
};

const formatConfigForResponse = (config) => {
  const formatted = JSON.parse(JSON.stringify(config));

  if (formatted.ocr?.providers) {
    OCR_PROVIDERS.forEach((key) => {
      if (formatted.ocr.providers[key]) {
        formatted.ocr.providers[key] = maskSensitiveFields(
          formatted.ocr.providers[key]
        );
      }
    });
  }

  if (formatted.ai?.providers) {
    AI_PROVIDERS.forEach((key) => {
      if (formatted.ai.providers[key]) {
        formatted.ai.providers[key] = maskSensitiveFields(
          formatted.ai.providers[key]
        );
      }
    });
  }

  if (formatted.notifications?.whatsapp) {
    formatted.notifications.whatsapp = maskSensitiveFields(
      formatted.notifications.whatsapp
    );
  }

  return formatted;
};

const getActiveOcrProvider = async () => {
  const config = await getApiIntegrationConfig();
  if (!config?.ocr?.isEnabled) {
    return null;
  }

  const providerKey = config.ocr.activeProvider;
  const provider = config.ocr.providers?.[providerKey];

  if (!provider?.isEnabled) {
    return null;
  }

  return {
    provider: providerKey,
    credentials: provider,
  };
};

const getActiveAiProvider = async () => {
  const config = await getApiIntegrationConfig();
  if (!config?.ai?.isEnabled) {
    return null;
  }

  const providerKey = config.ai.activeProvider;
  const provider = config.ai.providers?.[providerKey];

  if (!provider?.isEnabled) {
    return null;
  }

  const apiKey = typeof provider.apiKey === "string" ? provider.apiKey.trim() : "";
  const model = typeof provider.model === "string" ? provider.model.trim() : "";
  if (!apiKey || apiKey.includes("•") || !model) {
    return null;
  }

  return {
    provider: providerKey,
    credentials: provider,
  };
};

const hasNonEmpty = (value) =>
  typeof value === "string" && value.trim().length > 0 && !value.includes("•");

/**
 * Resume auto-extract is allowed when Super Admin AI is fully set.
 * OCR is optional: PDF uses pdf-parse; images fall back to built-in Tesseract
 * when no cloud OCR provider is configured (same as resumeParser.js).
 */
const getResumeExtractionStatus = async () => {
  const config = await getApiIntegrationConfig();
  const missing = [];
  let ocrConfigured = false;
  let aiConfigured = false;

  const ocrEnabled = Boolean(config?.ocr?.isEnabled);
  const ocrProviderKey = config?.ocr?.activeProvider;
  const ocrProvider = config?.ocr?.providers?.[ocrProviderKey];

  if (!ocrEnabled) {
    // Built-in Tesseract fallback — do not block resume extraction
    ocrConfigured = true;
  } else if (!ocrProvider?.isEnabled) {
    missing.push("the active OCR provider is not configured");
  } else if (ocrProviderKey === "tesseract") {
    ocrConfigured = true;
  } else if (ocrProviderKey === "google_vision" && !hasNonEmpty(ocrProvider.apiKey)) {
    missing.push("the Google Vision API key is missing");
  } else if (
    ocrProviderKey === "aws_textract" &&
    (!hasNonEmpty(ocrProvider.accessKeyId) || !hasNonEmpty(ocrProvider.secretAccessKey))
  ) {
    missing.push("AWS Textract credentials are missing");
  } else if (
    ocrProviderKey === "azure_document_intelligence" &&
    (!hasNonEmpty(ocrProvider.endpoint) || !hasNonEmpty(ocrProvider.apiKey))
  ) {
    missing.push("Azure Document Intelligence credentials are missing");
  } else {
    ocrConfigured = true;
  }

  const aiEnabled = Boolean(config?.ai?.isEnabled);
  const aiProviderKey = config?.ai?.activeProvider;
  const aiProvider = config?.ai?.providers?.[aiProviderKey];

  if (!aiEnabled) {
    missing.push("the AI service is not enabled");
  } else if (!aiProvider?.isEnabled) {
    missing.push("the active AI provider is not configured");
  } else if (!hasNonEmpty(aiProvider.apiKey)) {
    missing.push("the AI API key is missing");
  } else if (!hasNonEmpty(aiProvider.model)) {
    missing.push("the AI model is missing");
  } else {
    aiConfigured = true;
  }

  // Also clean OCR missing messages if any were pushed earlier - update those too
  const ready = ocrConfigured && aiConfigured;
  const message = ready
    ? "OCR & API Configuration is ready."
    : missing.length > 0
      ? `Resume auto-extraction is unavailable. Please ask your Super Admin to configure OCR & API Configuration (${missing.join("; ")}).`
      : "Resume auto-extraction is unavailable. Please ask your Super Admin to configure OCR & API Configuration.";

  return {
    ready,
    message,
    missing,
    ocr: {
      enabled: ocrEnabled,
      provider: ocrEnabled ? ocrProviderKey || null : "tesseract_fallback",
      configured: ocrConfigured,
    },
    ai: {
      enabled: aiEnabled,
      provider: aiProviderKey || null,
      configured: aiConfigured,
    },
  };
};

const getNotificationConfig = async () => {
  const config = await getApiIntegrationConfig();
  if (!config?.notifications?.isEnabled) {
    return null;
  }
  return config.notifications;
};

const mergeProviderSecrets = (incoming, existing) => {
  if (!incoming || typeof incoming !== "object") return existing || {};
  const merged = { ...existing, ...incoming };

  SENSITIVE_FIELDS.forEach((field) => {
    const incomingVal = incoming[field];
    if (
      incomingVal === undefined ||
      incomingVal === null ||
      incomingVal === "" ||
      (typeof incomingVal === "string" && incomingVal.includes("•"))
    ) {
      if (existing?.[field]) {
        merged[field] = existing[field];
      }
    }
    delete merged[`${field}Set`];
  });

  return merged;
};

module.exports = {
  CONFIG_ID,
  OCR_PROVIDERS,
  AI_PROVIDERS,
  SENSITIVE_FIELDS,
  getDefaultConfig,
  invalidateCache,
  getApiIntegrationConfig,
  formatConfigForResponse,
  getActiveOcrProvider,
  getActiveAiProvider,
  getResumeExtractionStatus,
  getNotificationConfig,
  mergeProviderSecrets,
};
