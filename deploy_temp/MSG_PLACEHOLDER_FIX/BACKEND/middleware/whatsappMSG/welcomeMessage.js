const axios = require("axios");
const https = require("https");
const mongoose = require("mongoose");
const WelcomeWhatsappConfig = require("../../models-v2/welcomeWhatsappConfig_Mongoose");
const WelcomeWhatsappLog = require("../../models-v2/welcomeWhatsappLog_Mongoose");

const CONFIG_ID = "welcome-whatsapp-config";

const isFilledValue = (value, { treatZeroAsEmpty = false } = {}) => {
  if (value === null || value === undefined) return false;
  if (typeof value === "object" && !Array.isArray(value)) {
    if ("value" in value) return isFilledValue(value.value, { treatZeroAsEmpty });
    if (value.id || value._id || value.jobCategory) return true;
    return false;
  }
  if (typeof value === "number") {
    if (Number.isNaN(value)) return false;
    if (treatZeroAsEmpty && value === 0) return false;
    return true;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return false;
    const lower = trimmed.toLowerCase();
    if (
      lower.startsWith("select ") ||
      lower === "current monthly salary + 20%" ||
      lower === "current employer" ||
      lower === "current company"
    ) {
      return false;
    }
    if (treatZeroAsEmpty && /^0+(\.0+)?$/.test(trimmed)) return false;
    return true;
  }
  if (Array.isArray(value)) return value.length > 0;
  return false;
};

/** Edit-form fields checked for empty / unfilled status (client checklist) */
const CANDIDATE_FIELD_CHECKS = [
  // Personal Information
  {
    key: "fullName",
    label: "Full Name",
    section: "Personal Information",
    get: (c) => `${c?.firstname || ""} ${c?.lastname || ""}`.trim(),
  },
  {
    key: "mobile",
    label: "Mobile Number",
    section: "Personal Information",
    get: (c) => c?.mobile,
  },
  {
    key: "alternateMobile",
    label: "Alternate Mobile",
    section: "Personal Information",
    get: (c) => c?.alternateMobile,
  },
  {
    key: "email",
    label: "Email",
    section: "Personal Information",
    get: (c) => c?.email,
  },
  {
    key: "gender",
    label: "Gender",
    section: "Personal Information",
    get: (c) => c?.gender,
  },
  {
    key: "dateOfBirth",
    label: "Date of Birth",
    section: "Personal Information",
    get: (c) => c?.dateOfBirth || c?.dob,
  },
  {
    key: "currentAddress",
    label: "Current Address",
    section: "Personal Information",
    get: (c) => c?.street || c?.address || c?.currentAddress,
  },
  {
    key: "city",
    label: "City",
    section: "Personal Information",
    get: (c) => c?.cityId || c?.city,
  },
  {
    key: "state",
    label: "State",
    section: "Personal Information",
    get: (c) => c?.stateId || c?.state,
  },

  // Professional Information
  {
    key: "currentCompany",
    label: "Current Company",
    section: "Professional Information",
    get: (c) =>
      c?.professional?.currentCompany ||
      c?.professional?.currentEmployer ||
      c?.currentCompany,
  },
  {
    key: "currentDesignation",
    label: "Current Designation",
    section: "Professional Information",
    get: (c) => c?.professional?.designation || c?.designation,
  },
  {
    key: "noticePeriod",
    label: "Notice Period",
    section: "Professional Information",
    get: (c) => c?.professional?.noticePeriod || c?.noticePeriod,
  },
  {
    key: "skills",
    label: "Skills",
    section: "Professional Information",
    get: (c) => c?.professional?.skill || c?.skill || c?.skills,
  },
  {
    key: "languages",
    label: "Languages",
    section: "Professional Information",
    get: (c) =>
      c?.languages ||
      c?.professional?.languages ||
      c?.professional?.english,
  },
  {
    key: "preferedJobLocation",
    label: "Preferred Job Location",
    section: "Professional Information",
    get: (c) =>
      c?.professional?.preferedJobLocation || c?.preferedJobLocation,
  },
  {
    key: "industry",
    label: "Industry",
    section: "Professional Information",
    get: (c) => c?.industries_relation || c?.industries,
  },
  {
    key: "education",
    label: "Education",
    section: "Professional Information",
    get: (c) => {
      if (Array.isArray(c?.education) && c.education.length > 0) return c.education;
      return (
        c?.professional?.highestQualification ||
        c?.highestQualification ||
        c?.professional?.field
      );
    },
  },
  {
    key: "certifications",
    label: "Certifications",
    section: "Professional Information",
    get: (c) => c?.certifications || c?.professional?.certifications,
  },

  // Additional Information
  {
    key: "resume",
    label: "Resume File",
    section: "Additional Information",
    get: (c) => c?.resume,
  },
  {
    key: "totalExperience",
    label: "Total Experience",
    section: "Additional Information",
    get: (c) =>
      c?.professional?.experienceInyear ||
      c?.experienceInyear ||
      c?.totalExperience,
    treatZeroAsEmpty: true,
  },
  {
    key: "currentSalary",
    label: "Current Salary",
    section: "Additional Information",
    get: (c) => c?.professional?.currentSalary ?? c?.currentSalary,
    treatZeroAsEmpty: true,
  },
  {
    key: "expectedSalary",
    label: "Expected Salary",
    section: "Additional Information",
    get: (c) =>
      c?.professional?.expectedsalary ??
      c?.expectedsalary ??
      c?.expectedSalary,
    treatZeroAsEmpty: true,
  },
];

exports.getUnfilledCandidateFields = (candidate = {}) => {
  const unfilled = [];
  CANDIDATE_FIELD_CHECKS.forEach((field) => {
    const value = field.get(candidate);
    if (!isFilledValue(value, { treatZeroAsEmpty: field.treatZeroAsEmpty })) {
      unfilled.push({
        key: field.key,
        label: field.label,
        section: field.section,
      });
    }
  });
  return unfilled;
};

/** Group unfilled labels by section for readable WhatsApp / API text */
exports.formatUnfilledFieldsBySection = (candidate = {}) => {
  const unfilled = exports.getUnfilledCandidateFields(candidate);
  if (!unfilled.length) return "";

  const order = [
    "Personal Information",
    "Professional Information",
    "Additional Information",
  ];
  const grouped = {};
  unfilled.forEach((f) => {
    const section = f.section || "Other";
    if (!grouped[section]) grouped[section] = [];
    grouped[section].push(f.label);
  });

  return order
    .filter((section) => grouped[section]?.length)
    .map((section) => `${section}: ${grouped[section].join(", ")}`)
    .join(" | ");
};

const getAssetBaseUrl = () => {
  const raw =
    process.env.BACKEND_PUBLIC_URL ||
    process.env.PUBLIC_APP_URL ||
    "";
  // Prefer API host for /uploads — never frontend URL (uploads live on API)
  if (raw && /^https?:\/\//i.test(raw)) {
    return String(raw).replace(/\/api\/?$/, "").replace(/\/$/, "");
  }
  if (process.env.NODE_ENV === "production") {
    return "https://steelblue-goshawk-113691.hostingersite.com";
  }
  const port = process.env.PORT || 7001;
  return `http://localhost:${port}`;
};

const resolveCandidateAssetUrl = (src) => {
  if (!src || typeof src !== "string") return "";
  const trimmed = src.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith("data:")) {
    return trimmed;
  }
  const base = getAssetBaseUrl();
  if (trimmed.startsWith("/uploads")) return `${base}${trimmed}`;
  if (trimmed.startsWith("uploads/")) return `${base}/${trimmed}`;
  if (/\.(png|jpe?g|gif|webp|pdf)$/i.test(trimmed)) {
    const folder = /\.pdf$/i.test(trimmed) ? "file" : "photos";
    return `${base}/uploads/${folder}/${encodeURIComponent(trimmed)}`;
  }
  return trimmed;
};

const pickStr = (...vals) => {
  for (const v of vals) {
    if (v == null) continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return "";
};

const splitFullName = (full) => {
  const parts = String(full || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return { first: "", last: "" };
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
};

/** Robust getters — OCR / forms sometimes use alternate keys */
const getCandidateFirstName = (c) => {
  const direct = pickStr(c?.firstname, c?.firstName, c?.first_name);
  if (direct) return direct;
  return splitFullName(pickStr(c?.fullname, c?.name, c?.candidateName)).first;
};

const getCandidateLastName = (c) => {
  const direct = pickStr(c?.lastname, c?.lastName, c?.last_name);
  if (direct) return direct;
  return splitFullName(pickStr(c?.fullname, c?.name, c?.candidateName)).last;
};

const getCandidateFullName = (c) =>
  pickStr(
    `${getCandidateFirstName(c)} ${getCandidateLastName(c)}`.trim(),
    c?.fullname,
    c?.name,
    c?.candidateName
  );

const getFrontendBaseUrl = () =>
  String(
    process.env.FRONTEND_APP_URL ||
      process.env.PUBLIC_FRONTEND_URL ||
      "https://peachpuff-snail-327679.hostingersite.com"
  ).replace(/\/$/, "");

const getAgencySlug = (c) =>
  pickStr(c?._agencySlug, c?.agencySlug, c?.slug, "uniqueworld");

const getCandidateId = (c) => pickStr(c?.id, c?._id);

/** Agency portal — opens that candidate for edit (`/{slug}/candidate?id=`) */
const buildCandidateEditLink = (c) => {
  const id = getCandidateId(c);
  if (!id) return "";
  return `${getFrontendBaseUrl()}/${getAgencySlug(c)}/candidate?id=${encodeURIComponent(id)}`;
};

/** Public registration form — candidate can continue / edit (`/{slug}/candidate/apply?cid=`) */
const buildCandidateRegistrationLink = (c) => {
  const id = getCandidateId(c);
  const base = `${getFrontendBaseUrl()}/${getAgencySlug(c)}/candidate/apply`;
  return id ? `${base}?cid=${encodeURIComponent(id)}` : base;
};

const PLACEHOLDER_MAP = {
  "{{firstname}}": (c) => getCandidateFirstName(c),
  "{{lastname}}": (c) => getCandidateLastName(c),
  "{{fullname}}": (c) => getCandidateFullName(c),
  "{{mobile}}": (c) => pickStr(c?.mobile, c?.phone, c?.phoneNumber),
  "{{email}}": (c) => pickStr(c?.email),
  "{{city}}": (c) => pickStr(c?.city),
  "{{image}}": (c) => resolveCandidateAssetUrl(c?.image),
  "{{img}}": (c) => resolveCandidateAssetUrl(c?.image),
  "{{photo}}": (c) => resolveCandidateAssetUrl(c?.image),
  "{{resume}}": (c) => resolveCandidateAssetUrl(c?.resume),
  "{{profile_link}}": (c) => buildCandidateEditLink(c),
  "{{edit_link}}": (c) => buildCandidateEditLink(c),
  "{{registration_link}}": (c) => buildCandidateRegistrationLink(c),
  "{{unfilled_fields}}": (c) => exports.formatUnfilledFieldsBySection(c),
  "{{unfilled_fields_list}}": (c) =>
    exports
      .getUnfilledCandidateFields(c)
      .map((f) => f.label)
      .join(", "),
  "{{unfilled_fields_keys}}": (c) =>
    exports
      .getUnfilledCandidateFields(c)
      .map((f) => f.key)
      .join(", "),
  "{{unfilled_fields_json}}": (c) =>
    JSON.stringify(exports.getUnfilledCandidateFields(c)),
  "{{unfilled_fields_labels_json}}": (c) =>
    JSON.stringify(
      exports.getUnfilledCandidateFields(c).map((f) => f.label)
    ),
  "{{unfilled_fields_by_section}}": (c) =>
    exports.formatUnfilledFieldsBySection(c),
};

const resolvePlaceholders = (text, candidate) => {
  if (typeof text !== "string" || !text) return text;
  let resolved = text;
  Object.entries(PLACEHOLDER_MAP).forEach(([key, fn]) => {
    // Escape replacement so $ in values don't break String.replace
    const replacement = String(fn(candidate) ?? "").replace(/\$/g, "$$$$");
    resolved = resolved.replace(
      new RegExp(key.replace(/[{}]/g, "\\$&"), "gi"),
      replacement
    );
  });
  return resolved;
};

const deepResolvePlaceholders = (value, candidate) => {
  if (typeof value === "string") {
    return resolvePlaceholders(value, candidate);
  }
  if (Array.isArray(value)) {
    return value.map((v) => deepResolvePlaceholders(v, candidate));
  }
  if (value && typeof value === "object") {
    const out = {};
    Object.entries(value).forEach(([k, v]) => {
      out[k] = deepResolvePlaceholders(v, candidate);
    });
    return out;
  }
  return value;
};

const isPublicHttpUrl = (url) => {
  if (!url || typeof url !== "string") return false;
  const trimmed = url.trim();
  // WhatsApp fetches the image from the internet — http localhost never works
  if (!/^https:\/\//i.test(trimmed)) return false;
  try {
    const u = new URL(trimmed);
    if (
      u.hostname === "localhost" ||
      u.hostname === "127.0.0.1" ||
      u.hostname.endsWith(".local") ||
      u.hostname === "0.0.0.0" ||
      /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(u.hostname)
    ) {
      return false;
    }
    return true;
  } catch (e) {
    return false;
  }
};

/** Used when hiring template needs IMAGE header but config has localhost/empty */
const getDefaultPublicHeaderImage = () =>
  process.env.WHATSAPP_DEFAULT_HEADER_IMAGE ||
  "https://images.unsplash.com/photo-1521737604893-d14cc237f11d?auto=format&fit=crop&w=1200&q=80";

const pickPublicImageLink = (rawLink) => {
  const link = String(rawLink || "").trim();
  if (isPublicHttpUrl(link)) return link;
  const fallback = getDefaultPublicHeaderImage();
  console.info(
    "Msg API: header image not public https — using fallback.",
    "got:",
    link || "(empty)",
    "| fallback:",
    fallback
  );
  return fallback;
};

/**
 * WhatsApp #132012 / #132018 — normalize components.
 * - Header IMAGE must stay if template expects it (do not silently drop)
 * - Empty texts get a safe fallback
 * - parameterMode: auto | named | positional
 *   auto: KEEP parameter_name when present in cURL (e.g. body_1) — hiring uses named
 */
const sanitizeTemplatePayload = (payload, options = {}) => {
  if (!payload || typeof payload !== "object") {
    return { payload, error: null };
  }

  const mode = options.parameterMode || "auto";
  const next = { ...payload };
  if (!next.template || typeof next.template !== "object") {
    return { payload: next, error: null };
  }

  const template = { ...next.template };
  const componentsIn = Array.isArray(template.components)
    ? template.components
    : [];

  const collectBodyNames = [];
  componentsIn.forEach((comp) => {
    if (String(comp?.type || "").toLowerCase() !== "body") return;
    (comp.parameters || []).forEach((p) => {
      if (p?.parameter_name) collectBodyNames.push(String(p.parameter_name).trim());
    });
  });

  // auto = keep names from cURL; only strip when user picks positional
  let useNamed = mode !== "positional";
  if (mode === "auto") {
    useNamed = collectBodyNames.length > 0;
  }
  if (mode === "named") useNamed = true;
  if (options.forceNamed === true) useNamed = true;
  if (options.forceNamed === false) useNamed = false;

  const componentsOut = [];

  componentsIn.forEach((comp) => {
    if (!comp || !comp.type) return;
    const compType = String(comp.type).toLowerCase();

    if (compType === "header") {
      const parameters = [];
      (comp.parameters || []).forEach((p) => {
        if (!p) return;
        if (p.type === "image") {
          const link =
            (p.image && p.image.link) ||
            (typeof p.image === "string" ? p.image : "") ||
            p.link ||
            "";
          // Always keep IMAGE header (required by hiring templates). Localhost → public fallback.
          parameters.push({
            type: "image",
            image: { link: pickPublicImageLink(link) },
          });
          return;
        }
        if (p.type === "text") {
          const text = String(p.text ?? "").trim() || "-";
          const param = { type: "text", text };
          if (useNamed && p.parameter_name) {
            param.parameter_name = String(p.parameter_name).trim();
          }
          parameters.push(param);
        }
      });
      if (parameters.length > 0) {
        componentsOut.push({ type: "header", parameters });
      }
      return;
    }

    if (compType === "body" || compType === "button" || compType === "footer") {
      const parameters = [];
      (comp.parameters || []).forEach((p) => {
        if (!p || !p.type) return;
        if (p.type === "text") {
          let text = p.text == null ? "" : String(p.text);
          text = text.trim();
          // Still an unresolved {{placeholder}} → treat as empty (avoid sending literal braces)
          if (/^\{\{[^}]+\}\}$/.test(text)) {
            console.info(
              "Msg API: unresolved placeholder in body text:",
              text,
              "| candidateId:",
              options.candidateId || "?"
            );
            text = "";
          }
          if (!text) text = "-";
          const param = { type: "text", text };
          if (useNamed && p.parameter_name && String(p.parameter_name).trim()) {
            param.parameter_name = String(p.parameter_name).trim();
          }
          parameters.push(param);
          return;
        }
        const copy = { ...p };
        if (!useNamed && copy.parameter_name) delete copy.parameter_name;
        parameters.push(copy);
      });
      if (parameters.length > 0) {
        const out = { type: compType, parameters };
        if (comp.sub_type) out.sub_type = comp.sub_type;
        if (comp.index !== undefined && comp.index !== null && comp.index !== "") {
          out.index = Number(comp.index);
        }
        componentsOut.push(out);
      }
    }
  });

  if (componentsOut.length > 0) {
    template.components = componentsOut;
  } else {
    delete template.components;
  }

  if (template.language && template.language.code) {
    template.language = {
      ...template.language,
      code: String(template.language.code).trim(),
    };
  }

  next.template = template;
  console.info(
    "Msg API sanitize => parameterMode:",
    mode,
    "| useNamed:",
    useNamed,
    "| components:",
    JSON.stringify(componentsOut)
  );
  return { payload: next, error: null, useNamed };
};

const extractWhatsappError = (error) => {
  const data = error?.response?.data;
  if (!data) return error?.message || "Unknown error";
  if (typeof data === "string") return data;
  return (
    data.message ||
    data.error_user_msg ||
    data.error?.message ||
    data.error?.error_user_msg ||
    data.error?.error_data?.details ||
    (typeof data.error === "string" ? data.error : null) ||
    error?.message ||
    "Unknown error"
  );
};

const parseParamValue = (raw, candidate) => {
  if (raw == null) return "";
  const asString = String(raw);
  const trimmed = asString.trim();
  // Parse JSON first, THEN resolve placeholders — so names with " / \ don't break JSON
  if (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  ) {
    try {
      return deepResolvePlaceholders(JSON.parse(trimmed), candidate);
    } catch (e) {
      return resolvePlaceholders(asString, candidate);
    }
  }
  return resolvePlaceholders(asString, candidate);
};

const setNestedValue = (obj, path, value) => {
  const parts = String(path)
    .split(".")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return;

  let current = obj;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const part = parts[i];
    if (
      current[part] == null ||
      typeof current[part] !== "object" ||
      Array.isArray(current[part])
    ) {
      current[part] = {};
    }
    current = current[part];
  }
  current[parts[parts.length - 1]] = value;
};

const buildPayloadFromParams = (bodyParams, candidate) => {
  const payload = {};
  (bodyParams || []).forEach((param) => {
    if (!param?.key) return;
    setNestedValue(payload, param.key, parseParamValue(param.value, candidate));
  });
  return payload;
};

const buildHeaders = (headers) => {
  const result = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  (headers || []).forEach((h) => {
    if (h?.key) {
      result[h.key] = h.value != null ? String(h.value) : "";
    }
  });
  return result;
};

const formatMobile = (mobile, prefix = "91") => {
  if (!mobile) return null;
  let digits = String(mobile).replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 11 && digits.startsWith("0")) {
    digits = digits.slice(1);
  }
  const pref = String(prefix || "91").replace(/\D/g, "") || "91";
  if (digits.startsWith(pref)) return digits;
  return `${pref}${digits}`;
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

const newApiId = () =>
  `api_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const legacyToApi = (plain) => {
  let headers = Array.isArray(plain.headers) ? plain.headers : [];
  if (!headers.length) {
    headers = [
      { key: "Content-Type", value: "application/json" },
      { key: "Accept", value: "application/json" },
      { key: "x-security-key", value: plain.securityKey || "" },
    ];
  }

  let bodyParams =
    Array.isArray(plain.bodyParams) && plain.bodyParams.length > 0
      ? plain.bodyParams
      : [
          {
            key: "messaging_product",
            value: plain.messagingProduct || "whatsapp",
          },
          {
            key: "recipient_type",
            value: plain.recipientType || "individual",
          },
          { key: "type", value: plain.messageType || "template" },
          {
            key: "template.name",
            value: plain.templateName || "uwp_hiring",
          },
          {
            key: "template.language.code",
            value: plain.templateLanguageCode || "en_US",
          },
        ];

  if (
    (!plain.bodyParams || plain.bodyParams.length === 0) &&
    Array.isArray(plain.components) &&
    plain.components.length > 0
  ) {
    bodyParams = [
      ...bodyParams,
      {
        key: "template.components",
        value: JSON.stringify(plain.components),
      },
    ];
  }

  return {
    id: newApiId(),
    name: "API Config 1",
    isEnabled: Boolean(plain.isEnabled),
    apiUrl:
      plain.apiUrl ||
      "https://wa2.netsofters.com/api/external-api-bridge/send-message",
    method: plain.method || "POST",
    curlText: "",
    headers,
    bodyParams,
    countryCodePrefix: plain.countryCodePrefix || "91",
    recipientKey: plain.recipientKey || "to",
    parameterMode: "auto",
  };
};

/** Normalize stored doc → { apis: [...] } with legacy migration */
exports.normalizeConfigDoc = (config) => {
  if (!config) {
    return { id: CONFIG_ID, apis: [] };
  }
  const plain =
    typeof config.toObject === "function" ? config.toObject() : { ...config };

  if (Array.isArray(plain.apis) && plain.apis.length > 0) {
    return {
      id: plain.id || CONFIG_ID,
      apis: plain.apis.map((api, idx) => ({
        id: api.id || newApiId(),
        name: api.name || `API Config ${idx + 1}`,
        isEnabled: Boolean(api.isEnabled),
        apiUrl: api.apiUrl || "",
        method: api.method || "POST",
        curlText: api.curlText || "",
        headers: Array.isArray(api.headers) ? api.headers : [],
        bodyParams: Array.isArray(api.bodyParams) ? api.bodyParams : [],
        countryCodePrefix: api.countryCodePrefix || "91",
        recipientKey: api.recipientKey || "to",
        parameterMode: api.parameterMode || "auto",
      })),
    };
  }

  // Migrate legacy single config if it has useful data
  if (plain.apiUrl || plain.securityKey || (plain.bodyParams || []).length) {
    return { id: plain.id || CONFIG_ID, apis: [legacyToApi(plain)] };
  }

  return { id: plain.id || CONFIG_ID, apis: [] };
};

exports.getWelcomeWhatsappConfig = async () => {
  let config = await WelcomeWhatsappConfig.findOne({ id: CONFIG_ID });
  if (!config) {
    config = await WelcomeWhatsappConfig.create({ id: CONFIG_ID, apis: [] });
  }
  return exports.normalizeConfigDoc(config);
};

const sendSingleApi = async (api, candidate) => {
  const apiMeta = {
    apiId: api.id,
    apiName: api.name,
  };

  if (!api?.isEnabled) {
    return { skipped: true, reason: "disabled", ...apiMeta };
  }

  if (
    !api.apiUrl ||
    !Array.isArray(api.bodyParams) ||
    api.bodyParams.length === 0
  ) {
    await logMessage({
      candidateId: candidate?.id,
      mobile: candidate?.mobile,
      status: "skipped",
      error: `Msg API "${api.name}" config is incomplete`,
      ...apiMeta,
    });
    return { skipped: true, reason: "incomplete_config", ...apiMeta };
  }

  const to = formatMobile(candidate?.mobile, api.countryCodePrefix || "91");
  if (!to) {
    await logMessage({
      candidateId: candidate?.id,
      mobile: candidate?.mobile,
      status: "skipped",
      error: "Candidate mobile number missing",
      ...apiMeta,
    });
    return { skipped: true, reason: "no_mobile", ...apiMeta };
  }

  try {
    console.info(
      "Msg API calling =>",
      api.name,
      api.apiUrl,
      "| to:",
      to,
      "| candidate:",
      candidate?.id
    );

    let payload = buildPayloadFromParams(api.bodyParams, candidate);
    const recipientKey = api.recipientKey || "to";
    setNestedValue(payload, recipientKey, to);

    // Resolve placeholders on nested values (safe for quotes/special chars)
    payload = deepResolvePlaceholders(payload, candidate);

    const parameterMode = api.parameterMode || "auto";
    let sanitized = sanitizeTemplatePayload(payload, {
      parameterMode,
      candidateId: candidate?.id,
    });

    if (sanitized.error) {
      await logMessage({
        candidateId: candidate?.id,
        mobile: to,
        status: "failed",
        requestPayload: payload,
        error: sanitized.error,
        ...apiMeta,
      });
      console.info("sendWelcomeWhatsapp precheck =>", api.name, sanitized.error);
      return { success: false, error: sanitized.error, ...apiMeta };
    }

    let finalPayload = sanitized.payload;
    let usedNamed = sanitized.useNamed;

    console.info(
      "Msg API payload template.components =>",
      JSON.stringify(finalPayload?.template?.components || null)
    );

    const headers = buildHeaders(api.headers);
    const method = (api.method || "POST").toLowerCase();
    const agent = new https.Agent({ rejectUnauthorized: false });

    const doRequest = async (data) => {
      const axiosConfig = {
        method,
        url: api.apiUrl,
        headers,
        httpsAgent: agent,
        timeout: 45000,
      };
      if (method === "get") {
        axiosConfig.params = data;
      } else {
        axiosConfig.data = data;
      }
      return axios(axiosConfig);
    };

    let response = await doRequest(finalPayload);

    // Soft WhatsApp error inside HTTP 200
    const readSoftError = (data) => {
      const nested =
        data?.error?.message || data?.message || data?.error;
      if (!nested) return null;
      if (
        String(nested).includes("#132") ||
        String(nested).toLowerCase().includes("issue with the parameters") ||
        String(nested).toLowerCase().includes("parameter format") ||
        data?.error?.code
      ) {
        return typeof nested === "string"
          ? nested
          : nested?.message || JSON.stringify(nested);
      }
      return null;
    };

    let errMsg = readSoftError(response?.data);

    // Retry once with opposite named/positional if format mismatch
    if (
      errMsg &&
      parameterMode === "auto" &&
      (String(errMsg).includes("#132012") ||
        String(errMsg).includes("#132018") ||
        String(errMsg).toLowerCase().includes("parameter format"))
    ) {
      const retry = sanitizeTemplatePayload(payload, {
        parameterMode,
        forceNamed: !usedNamed,
      });
      if (!retry.error && retry.payload) {
        console.info(
          "Msg API retry opposite param format =>",
          api.name,
          "| forceNamed:",
          !usedNamed
        );
        response = await doRequest(retry.payload);
        finalPayload = retry.payload;
        errMsg = readSoftError(response?.data);
      }
    }

    if (errMsg) {
      await logMessage({
        candidateId: candidate?.id,
        mobile: to,
        status: "failed",
        requestPayload: finalPayload,
        response: response?.data,
        error: errMsg,
        ...apiMeta,
      });
      console.info("sendWelcomeWhatsapp soft-error =>", api.name, errMsg);
      return { success: false, error: errMsg, ...apiMeta };
    }

    console.info(
      "Msg API success =>",
      api.name,
      "| to:",
      to,
      "| candidate:",
      candidate?.id
    );

    await logMessage({
      candidateId: candidate?.id,
      mobile: to,
      status: "success",
      requestPayload: finalPayload,
      response: response?.data,
      ...apiMeta,
    });

    return { success: true, data: response?.data, ...apiMeta };
  } catch (error) {
    const errMsg = extractWhatsappError(error);

    let requestPayload;
    try {
      requestPayload = error?.config?.data
        ? typeof error.config.data === "string"
          ? JSON.parse(error.config.data)
          : error.config.data
        : undefined;
    } catch (e) {
      requestPayload = error?.config?.data;
    }

    await logMessage({
      candidateId: candidate?.id,
      mobile: to,
      status: "failed",
      requestPayload,
      response: error?.response?.data,
      error: errMsg,
      ...apiMeta,
    });

    console.info("sendWelcomeWhatsapp error =>", api.name, errMsg);
    return { success: false, error: errMsg, ...apiMeta };
  }
};

/** Call every enabled cURL/API config for this candidate */
exports.sendWelcomeWhatsapp = async (candidateInput) => {
  let candidate =
    candidateInput && typeof candidateInput.toObject === "function"
      ? candidateInput.toObject()
      : candidateInput || {};

  // Always re-load from DB so firstname/lastname/etc. are present at send time
  try {
    const Candidates = require("../../models-v2/candidates_Mongoose");
    const Agency = require("../../models-v2/agency_Mongooes");
    const cid = getCandidateId(candidate);
    if (cid) {
      const fresh = await Candidates.findOne({ id: String(cid) }).lean();
      if (fresh) {
        // DB row wins for identity fields (avoids empty strings from create race)
        candidate = {
          ...candidate,
          ...fresh,
          id: fresh.id || cid,
          firstname: pickStr(fresh.firstname, candidate.firstname),
          lastname: pickStr(fresh.lastname, candidate.lastname),
          mobile: pickStr(fresh.mobile, candidate.mobile),
          email: pickStr(fresh.email, candidate.email),
          city: pickStr(fresh.city, candidate.city),
        };
      }
    }
    const agencyId = candidate?.agencyId;
    if (agencyId) {
      const agency = await Agency.findOne({ id: String(agencyId) })
        .select("slug name")
        .lean();
      if (agency?.slug) {
        candidate._agencySlug = agency.slug;
      }
    }
    console.info(
      "Msg API candidate fields =>",
      "id:",
      candidate?.id,
      "firstname:",
      getCandidateFirstName(candidate) || "(empty)",
      "lastname:",
      getCandidateLastName(candidate) || "(empty)",
      "mobile:",
      candidate?.mobile || "(empty)",
      "slug:",
      candidate?._agencySlug || "(none)"
    );
  } catch (enrichErr) {
    console.info(
      "Msg API candidate enrich error =>",
      enrichErr?.message || enrichErr
    );
  }

  const config = await exports.getWelcomeWhatsappConfig();
  const apis = Array.isArray(config.apis) ? config.apis : [];
  const enabledApis = apis.filter((a) => a.isEnabled);

  if (enabledApis.length === 0) {
    await logMessage({
      candidateId: candidate?.id,
      mobile: candidate?.mobile,
      status: "skipped",
      error: "No enabled Msg API — turn on at least one cURL config",
    });
    return { skipped: true, reason: "no_enabled_apis" };
  }

  // Parallel — one slow/timeout API must not block the other
  const settled = await Promise.allSettled(
    enabledApis.map((api) => sendSingleApi(api, candidate))
  );
  const results = settled.map((s, i) =>
    s.status === "fulfilled"
      ? s.value
      : {
          success: false,
          error: s.reason?.message || "Unknown error",
          apiId: enabledApis[i]?.id,
          apiName: enabledApis[i]?.name,
        }
  );

  return { success: results.some((r) => r.success), results };
};
