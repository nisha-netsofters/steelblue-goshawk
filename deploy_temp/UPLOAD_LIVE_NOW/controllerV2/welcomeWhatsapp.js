const {
  getWelcomeWhatsappConfig,
  normalizeConfigDoc,
} = require("../middleware/whatsappMSG/welcomeMessage");
const WelcomeWhatsappConfig = require("../models-v2/welcomeWhatsappConfig_Mongoose");
const WelcomeWhatsappLog = require("../models-v2/welcomeWhatsappLog_Mongoose");

const CONFIG_ID = "welcome-whatsapp-config";

const newApiId = () =>
  `api_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const normalizeApi = (api, idx = 0) => {
  const headers = Array.isArray(api.headers)
    ? api.headers
        .filter((h) => h?.key?.trim())
        .map((h) => ({
          key: String(h.key).trim(),
          value: h.value != null ? String(h.value) : "",
        }))
    : [];

  const bodyParams = Array.isArray(api.bodyParams)
    ? api.bodyParams
        .filter((p) => p?.key?.trim())
        .map((p) => ({
          key: String(p.key).trim(),
          value: p.value != null ? String(p.value) : "",
        }))
    : [];

  return {
    id: api.id || newApiId(),
    name: (api.name || `API Config ${idx + 1}`).trim(),
    isEnabled:
      api.isEnabled === true ||
      api.isEnabled === 1 ||
      String(api.isEnabled || "").trim().toLowerCase() === "true",
    apiUrl: String(api.apiUrl || "").trim(),
    method: api.method || "POST",
    curlText: api.curlText || "",
    headers,
    bodyParams,
    countryCodePrefix: api.countryCodePrefix || "91",
    recipientKey: api.recipientKey || "to",
    parameterMode: ["auto", "named", "positional"].includes(api.parameterMode)
      ? api.parameterMode
      : "auto",
  };
};

exports.getConfig = async (req, res) => {
  try {
    const config = await getWelcomeWhatsappConfig();
    res.json(config);
  } catch (error) {
    console.info("getWelcomeWhatsappConfig error =>", error);
    res.status(500).json({ error: "Failed to fetch message API config" });
  }
};

exports.saveConfig = async (req, res) => {
  try {
    let apis = req.body?.apis;

    // Backward compat: single config payload → wrap as one API
    if (!Array.isArray(apis)) {
      const {
        isEnabled,
        apiUrl,
        method,
        headers,
        bodyParams,
        countryCodePrefix,
        recipientKey,
        curlText,
        name,
        id,
      } = req.body || {};
      apis = [
        {
          id,
          name: name || "API Config 1",
          isEnabled,
          apiUrl,
          method,
          headers,
          bodyParams,
          countryCodePrefix,
          recipientKey,
          curlText,
        },
      ];
    }

    if (!apis.length) {
      return res.status(400).json({ error: "Add at least one cURL / API config" });
    }

    const normalizedApis = apis.map((api, idx) => normalizeApi(api, idx));

    for (const api of normalizedApis) {
      if (!api.apiUrl) {
        return res.status(400).json({
          error: `"${api.name}" — API URL is required`,
        });
      }
      if (!api.bodyParams.length) {
        return res.status(400).json({
          error: `"${api.name}" — at least one body parameter is required`,
        });
      }
    }

    const config = await WelcomeWhatsappConfig.findOneAndUpdate(
      { id: CONFIG_ID },
      {
        $set: { apis: normalizedApis },
        $setOnInsert: { id: CONFIG_ID },
      },
      { new: true, upsert: true }
    );

    res.json({ msg: "success", data: normalizeConfigDoc(config) });
  } catch (error) {
    console.info("saveWelcomeWhatsappConfig error =>", error);
    res.status(500).json({ error: "Failed to save message API config" });
  }
};

exports.getLogs = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const perPage = parseInt(req.query.perPage, 10) || 10;
    const skip = (page - 1) * perPage;

    const [logs, total] = await Promise.all([
      WelcomeWhatsappLog.find()
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(perPage),
      WelcomeWhatsappLog.countDocuments(),
    ]);

    res.json({
      data: logs,
      total,
      page,
      perPage,
      totalPages: Math.max(1, Math.ceil(total / perPage)),
    });
  } catch (error) {
    console.info("getWelcomeWhatsappLogs error =>", error);
    res.status(500).json({ error: "Failed to fetch logs" });
  }
};

exports.deleteLogs = async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter(Boolean) : [];
    if (!ids.length) {
      return res.status(400).json({ error: "No log ids provided" });
    }

    const result = await WelcomeWhatsappLog.deleteMany({
      $or: [{ id: { $in: ids } }, { _id: { $in: ids } }],
    });

    res.json({
      msg: "success",
      deleted: result.deletedCount || 0,
    });
  } catch (error) {
    console.info("deleteWelcomeWhatsappLogs error =>", error);
    res.status(500).json({ error: "Failed to delete logs" });
  }
};

exports.clearLogs = async (req, res) => {
  try {
    const result = await WelcomeWhatsappLog.deleteMany({});
    res.json({
      msg: "success",
      deleted: result.deletedCount || 0,
    });
  } catch (error) {
    console.info("clearWelcomeWhatsappLogs error =>", error);
    res.status(500).json({ error: "Failed to clear logs" });
  }
};

const getBackendPublicBase = (req) => {
  const fromEnv =
    process.env.BACKEND_PUBLIC_URL || process.env.PUBLIC_APP_URL || "";
  if (fromEnv && /^https?:\/\//i.test(fromEnv)) {
    return String(fromEnv).replace(/\/api\/?$/, "").replace(/\/$/, "");
  }
  const xfProto = String(req.headers["x-forwarded-proto"] || "")
    .split(",")[0]
    .trim();
  const xfHost = String(req.headers["x-forwarded-host"] || "")
    .split(",")[0]
    .trim();
  const host = xfHost || req.get("host") || "";
  if (host && !/localhost|127\.0\.0\.1/i.test(host)) {
    const proto = xfProto || req.protocol || "https";
    return `${proto}://${host}`.replace(/\/$/, "");
  }
  // Local request — keep localhost (files are on this machine)
  const port = process.env.PORT || 7001;
  return `http://localhost:${port}`;
};

exports.uploadImage = async (req, res) => {
  try {
    const { awsUploadFiles } = require("../middleware/awsS3");
    const file = req.files?.image || req.files?.file;
    if (!file) {
      return res.status(400).json({ error: "No image file uploaded" });
    }
    const resp = await awsUploadFiles(file);
    if (!resp?.url) {
      return res.status(500).json({ error: "Image upload failed" });
    }
    const base = getBackendPublicBase(req);
    const url = /^https?:\/\//i.test(resp.url)
      ? resp.url
      : `${String(base).replace(/\/$/, "")}${resp.url}`;
    res.json({ msg: "success", url, path: resp.url });
  } catch (error) {
    console.info("welcomeWhatsapp uploadImage error =>", error);
    res.status(500).json({ error: "Failed to upload image" });
  }
};
