const axios = require("axios");
const https = require("https");
const mongoose = require("mongoose");
const WelcomeWhatsappConfig = require("../../models-v2/welcomeWhatsappConfig_Mongoose");
const WelcomeWhatsappLog = require("../../models-v2/welcomeWhatsappLog_Mongoose");

const CONFIG_ID = "welcome-whatsapp-config";

const PLACEHOLDER_MAP = {
  "{{firstname}}": (c) => c?.firstname || "",
  "{{lastname}}": (c) => c?.lastname || "",
  "{{fullname}}": (c) =>
    `${c?.firstname || ""} ${c?.lastname || ""}`.trim(),
  "{{mobile}}": (c) => c?.mobile || "",
  "{{email}}": (c) => c?.email || "",
  "{{city}}": (c) => c?.city || "",
};

const resolvePlaceholders = (text, candidate) => {
  if (!text) return text;
  let resolved = text;
  Object.entries(PLACEHOLDER_MAP).forEach(([key, fn]) => {
    resolved = resolved.replace(new RegExp(key, "gi"), fn(candidate));
  });
  return resolved;
};

const buildTemplateComponents = (components, candidate) => {
  if (!Array.isArray(components) || components.length === 0) return undefined;

  return components
    .filter((comp) => comp?.type)
    .map((comp) => {
      const built = { type: comp.type };
      if (Array.isArray(comp.parameters) && comp.parameters.length > 0) {
        built.parameters = comp.parameters
          .filter((p) => p?.type)
          .map((p) => {
            const param = { type: p.type };
            if (p.parameterName) param.parameter_name = p.parameterName;
            if (p.text) param.text = resolvePlaceholders(p.text, candidate);
            if (p.subType) param.sub_type = p.subType;
            if (p.index !== undefined && p.index !== null && p.index !== "")
              param.index = Number(p.index);
            return param;
          });
      }
      return built;
    });
};

const formatMobile = (mobile, prefix = "91") => {
  if (!mobile) return null;
  const digits = String(mobile).replace(/\D/g, "");
  if (digits.startsWith(prefix)) return digits;
  return `${prefix}${digits}`;
};

const logMessage = async (data) => {
  try {
    const logId = new mongoose.Types.ObjectId();
    await WelcomeWhatsappLog.create({
      id: String(logId),
      _id: logId,
      ...data,
    });
  } catch (err) {
    console.info("welcomeWhatsapp log error =>", err?.message);
  }
};

exports.getWelcomeWhatsappConfig = async () => {
  let config = await WelcomeWhatsappConfig.findOne({ id: CONFIG_ID });
  if (!config) {
    config = await WelcomeWhatsappConfig.create({ id: CONFIG_ID });
  }
  return config;
};

exports.sendWelcomeWhatsapp = async (candidate) => {
  try {
    const config = await exports.getWelcomeWhatsappConfig();

    if (!config?.isEnabled) {
      await logMessage({
        candidateId: candidate?.id,
        mobile: candidate?.mobile,
        status: "skipped",
        error: "Welcome WhatsApp is disabled",
      });
      return { skipped: true, reason: "disabled" };
    }

    const required = [
      config.apiUrl,
      config.securityKey,
      config.messagingProduct,
      config.recipientType,
      config.messageType,
      config.templateName,
      config.templateLanguageCode,
    ];
    if (required.some((v) => !v)) {
      await logMessage({
        candidateId: candidate?.id,
        mobile: candidate?.mobile,
        status: "skipped",
        error: "Welcome WhatsApp config is incomplete",
      });
      return { skipped: true, reason: "incomplete_config" };
    }

    const to = formatMobile(candidate?.mobile, config.countryCodePrefix || "91");
    if (!to) {
      await logMessage({
        candidateId: candidate?.id,
        mobile: candidate?.mobile,
        status: "skipped",
        error: "Candidate mobile number missing",
      });
      return { skipped: true, reason: "no_mobile" };
    }

    const payload = {
      messaging_product: config.messagingProduct,
      recipient_type: config.recipientType,
      to,
      type: config.messageType,
      template: {
        name: config.templateName,
        language: { code: config.templateLanguageCode },
      },
    };

    const builtComponents = buildTemplateComponents(
      config.components,
      candidate
    );
    if (builtComponents?.length) {
      payload.template.components = builtComponents;
    }

    const agent = new https.Agent({ rejectUnauthorized: false });
    const response = await axios.post(config.apiUrl, payload, {
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "x-security-key": config.securityKey,
      },
      httpsAgent: agent,
      timeout: 15000,
    });

    await logMessage({
      candidateId: candidate?.id,
      mobile: candidate?.mobile,
      status: "success",
      requestPayload: payload,
      response: response?.data,
    });

    return { success: true, data: response?.data };
  } catch (error) {
    const errMsg =
      error?.response?.data?.message ||
      error?.response?.data?.error ||
      error?.message ||
      "Unknown error";

    await logMessage({
      candidateId: candidate?.id,
      mobile: candidate?.mobile,
      status: "failed",
      requestPayload: error?.config?.data
        ? JSON.parse(error.config.data)
        : undefined,
      response: error?.response?.data,
      error: errMsg,
    });

    console.info("sendWelcomeWhatsapp error =>", errMsg);
    return { success: false, error: errMsg };
  }
};
