const axios = require("axios");
const https = require("https");
const mongoose = require("mongoose");
const WelcomeWhatsappConfig = require("../../models-v2/welcomeWhatsappConfig_Mongoose");
const WelcomeWhatsappLog = require("../../models-v2/welcomeWhatsappLog_Mongoose");

const CONFIG_ID = "welcome-whatsapp-config";

const isApiEnabled = (api) => {
  if (!api) return false;
  const v = api.isEnabled;
  if (v === true || v === 1) return true;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    return s === "true" || s === "1" || s === "yes" || s === "on";
  }
  return false;
};

const getApiAudience = (api) => {
  if (api?.id === "msg-client-welcome") return "client";
  if (
    api?.id === "msg-customer-welcome" ||
    api?.id === "msg-customer-unfilled"
  ) {
    return "candidate";
  }
  if (api?.id === "msg-welcome-both") return "candidate";
  if (api?.id === "msg-candidate-welcome") return "candidate";
  if (api?.audience === "client") return "client";
  return "candidate";
};

const apiMatchesTrigger = (api, trigger) =>
  getApiAudience(api) === trigger;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const getMultiApiGapMs = () => {
  const raw = Number(process.env.WHATSAPP_MULTI_API_DELAY_MS);
  return Number.isFinite(raw) && raw >= 0 ? raw : 2000;
};

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

/** Group unfilled labels — keep short; long values trigger WhatsApp #132012 */
exports.formatUnfilledFieldsBySection = (candidate = {}) => {
  const unfilled = exports.getUnfilledCandidateFields(candidate);
  if (!unfilled.length) return "Complete";

  // Labels only, hard cap — Postman static values are short; long text fails on live
  const text = unfilled
    .map((f) => f.label)
    .join(", ");
  if (text.length <= 120) return text;
  return `${text.slice(0, 117).trim()}...`;
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

const getCandidateId = (c) => {
  const raw = c?.id != null ? c.id : c?._id;
  if (raw == null) return "";
  return String(raw).trim();
};

/**
 * Candidate portal profile link.
 * Goes through /login?redirect=... so unauthenticated users land on login
 * and are sent to `/{slug}/profile` after sign-in.
 */
const buildCandidateProfileLink = (c) => {
  const profilePath = `/${getAgencySlug(c)}/profile`;
  return `${getFrontendBaseUrl()}/login?redirect=${encodeURIComponent(profilePath)}`;
};

/** Same URL as profile link (legacy alias) */
const buildCandidateEditLink = (c) => buildCandidateProfileLink(c);

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
  "{{profile_link}}": (c) => buildCandidateProfileLink(c),
  "{{candidate_profile_link}}": (c) => buildCandidateProfileLink(c),
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
  "{{companyName}}": (c) => pickStr(c?.companyName, c?.companyname),
  "{{companyowner}}": (c) =>
    pickStr(c?.companyowner, c?.companyOwner, c?.name),
};

const resolveByToken = (token, candidate) => {
  const key = String(token || "")
    .trim()
    .toLowerCase()
    .replace(/^\{\{|\}\}$/g, "")
    .replace(/^｛｛|｝｝$/g, "");
  if (!key) return "";
  const mapped = PLACEHOLDER_MAP[`{{${key}}}`];
  if (typeof mapped === "function") return String(mapped(candidate) ?? "");
  return "";
};

/** Normalize fancy/unicode braces so {{firstname}} always matches */
const normalizePlaceholderSyntax = (text) =>
  String(text || "")
    .replace(/｛｛/g, "{{")
    .replace(/｝｝/g, "}}")
    .replace(/［［/g, "{{")
    .replace(/］］/g, "}}")
    .replace(/\[\[/g, "{{")
    .replace(/\]\]/g, "}}");

/**
 * WhatsApp rejects body/header text with newlines, tabs, 4+ spaces,
 * leftover {{placeholders}}, or empty values → causes #132012 / #100.
 */
const sanitizeWhatsAppParamText = (raw, { maxLen = 200 } = {}) => {
  let text = normalizePlaceholderSyntax(raw == null ? "" : String(raw));
  // Strip any leftover {{token}} (unresolved) — braces are invalid in params
  text = text.replace(/\{\{[^}]*\}\}/g, "").trim();
  // Newlines / tabs / other control chars → space
  text = text.replace(/[\r\n\t\f\v\u00A0\u200B\u200C\u200D\uFEFF]+/g, " ");
  // Collapse long space runs (WhatsApp max 4 consecutive)
  text = text.replace(/ {2,}/g, " ");
  text = text.trim();
  if (!text) text = "-";
  if (text.length > maxLen) {
    text = `${text.slice(0, Math.max(1, maxLen - 3)).trim()}...`;
  }
  return text;
};

const resolvePlaceholders = (text, candidate, options = {}) => {
  if (typeof text !== "string" || !text) return text;
  let resolved = normalizePlaceholderSyntax(text).trim();

  // CRITICAL: never treat bare tokens as placeholders.
  // Template name can be literally "unfilled_fields" — that must stay as-is.
  // Only replace explicit {{placeholder}} forms (and [[placeholder]]).
  const allowBare = options.allowBareToken === true;
  if (
    allowBare &&
    /^[a-z0-9_]+$/i.test(resolved) &&
    PLACEHOLDER_MAP[`{{${resolved.toLowerCase()}}}`]
  ) {
    const tokenVal = resolveByToken(resolved, candidate);
    const isUrl = /^https?:\/\//i.test(String(tokenVal || "").trim());
    return sanitizeWhatsAppParamText(tokenVal, { maxLen: isUrl ? 500 : 200 });
  }

  // No {{...}} at all → leave structural values untouched (template names, en, whatsapp, etc.)
  if (!/\{\{[^}]+\}\}/.test(resolved)) {
    return text;
  }

  Object.entries(PLACEHOLDER_MAP).forEach(([key, fn]) => {
    // Escape replacement so $ in values don't break String.replace
    const replacement = String(fn(candidate) ?? "").replace(/\$/g, "$$$$");
    resolved = resolved.replace(
      new RegExp(key.replace(/[{}]/g, "\\$&"), "gi"),
      replacement
    );
  });
  const isUrl = /^https?:\/\//i.test(resolved.trim());
  return sanitizeWhatsAppParamText(resolved, { maxLen: isUrl ? 500 : 200 });
};

const deepResolvePlaceholders = (value, candidate, options = {}) => {
  if (typeof value === "string") {
    return resolvePlaceholders(value, candidate, options);
  }
  if (Array.isArray(value)) {
    return value.map((v) => deepResolvePlaceholders(v, candidate, options));
  }
  if (value && typeof value === "object") {
    const out = {};
    Object.entries(value).forEach(([k, v]) => {
      // Never resolve placeholder substitution into template identity fields
      if (k === "name" && typeof v === "string" && !/\{\{/.test(v)) {
        out[k] = v;
        return;
      }
      out[k] = deepResolvePlaceholders(v, candidate, options);
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

/** Encode spaces / unsafe chars in image URL path (common #132012 IMAGE UNKNOWN cause) */
const normalizeImageLink = (rawLink) => {
  const link = String(rawLink || "").trim();
  if (!link) return "";
  // Placeholder from sample cURLs — never send to WhatsApp
  if (/example\.com/i.test(link)) return "";
  try {
    const u = new URL(link);
    // Encode each path segment (keeps "/" structure, fixes "new logo .png")
    u.pathname = u.pathname
      .split("/")
      .map((seg) => {
        if (!seg) return seg;
        try {
          return encodeURIComponent(decodeURIComponent(seg));
        } catch (e) {
          return encodeURIComponent(seg);
        }
      })
      .join("/");
    return u.toString();
  } catch (e) {
    return link.replace(/\s+/g, "%20");
  }
};

const pickPublicImageLink = (rawLink) => {
  const link = normalizeImageLink(rawLink);
  if (isPublicHttpUrl(link)) return link;
  const fallback = getDefaultPublicHeaderImage();
  console.info(
    "Msg API: header image not public https — using fallback.",
    "got:",
    String(rawLink || "").trim() || "(empty)",
    "| fallback:",
    fallback
  );
  return fallback;
};

/** body_1 / body_2 are bridge placeholders — Meta positional templates reject them as names */
const isBridgeBodyParamName = (name) =>
  /^(body|header|button|footer)_\d+$/i.test(String(name || "").trim());

/**
 * WhatsApp #132012 / #132018 — normalize components.
 * Postman parity: keep parameter_name from cURL (body_1/body_2) on first try.
 * Only replace body text + fix image URL — do not reshape template.
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

  // Lock identity fields — never let placeholder resolution overwrite them
  const lockedName = String(next.template.name || "").trim();
  const lockedLanguage = next.template.language
    ? { ...next.template.language }
    : undefined;

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

  // auto: KEEP cURL parameter names (Postman works with body_1/body_2).
  // Only strip when user picks positional or retry forces it.
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
          const finalLink = options.forceFallbackImage
            ? getDefaultPublicHeaderImage()
            : pickPublicImageLink(link);
          parameters.push({
            type: "image",
            image: { link: finalLink },
          });
          return;
        }
        if (p.type === "text") {
          const text = sanitizeWhatsAppParamText(p.text, { maxLen: 60 });
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
          text = normalizePlaceholderSyntax(text).trim();
          const paramName = p.parameter_name
            ? String(p.parameter_name).trim()
            : "";

          if (
            /^\{\{[^}]+\}\}$/.test(text) ||
            (/^[a-z0-9_]+$/i.test(text) &&
              PLACEHOLDER_MAP[`{{${text.toLowerCase()}}}`])
          ) {
            const fromToken = resolveByToken(text, options.candidate || {});
            console.info(
              "Msg API: resolving body placeholder:",
              text,
              "→",
              (fromToken || "(empty)").slice(0, 80),
              "| parameter_name:",
              paramName || "-",
              "| candidateId:",
              options.candidateId || "?"
            );
            text = fromToken;
          } else if (/\{\{[^}]+\}\}/.test(text)) {
            text = resolvePlaceholders(text, options.candidate || {});
          }

          if (
            !String(text || "").trim() &&
            paramName &&
            !isBridgeBodyParamName(paramName)
          ) {
            text = resolveByToken(paramName, options.candidate || {});
          }

          // URLs (profile/resume) can be longer; plain text keep short like Postman samples
          const isUrl = /^https?:\/\//i.test(String(text || "").trim());
          text = sanitizeWhatsAppParamText(text, {
            maxLen: isUrl ? 500 : 200,
          });

          const param = { type: "text", text };
          if (useNamed && paramName) {
            param.parameter_name = paramName;
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

  // Restore locked identity (prevents unfilled text ever becoming template name)
  if (lockedName) {
    template.name = lockedName;
  }
  if (lockedLanguage) {
    template.language = {
      ...lockedLanguage,
      code: String(lockedLanguage.code || "en").trim() || "en",
    };
  } else if (template.language && template.language.code) {
    template.language = {
      ...template.language,
      code: String(template.language.code).trim(),
    };
  }

  next.template = template;

  // Final guard
  if (
    next.template?.name &&
    (next.template.name.length > 60 ||
      /\s{2,}/.test(next.template.name) ||
      /Professional Information|Personal Information|unfilled/i.test(
        next.template.name
      ))
  ) {
    console.info(
      "Msg API: refusing corrupt template.name, restoring lock:",
      next.template.name.slice(0, 80)
    );
    if (lockedName && lockedName.length <= 60) {
      next.template.name = lockedName;
    }
  }

  console.info(
    "Msg API sanitize => parameterMode:",
    mode,
    "| useNamed:",
    useNamed,
    "| template.name:",
    next.template?.name,
    "| components:",
    JSON.stringify(componentsOut)
  );
  return { payload: next, error: null, useNamed };
};

const extractWhatsappError = (error) => {
  const data = error?.response?.data;
  if (!data) return error?.message || "Unknown error";
  if (typeof data === "string") return data;
  const details =
    data.error?.error_data?.details ||
    data.error_data?.details ||
    data.details ||
    "";
  const main =
    data.message ||
    data.error_user_msg ||
    data.error?.message ||
    data.error?.error_user_msg ||
    (typeof data.error === "string" ? data.error : null) ||
    error?.message ||
    "Unknown error";
  if (details && !String(main).includes(String(details))) {
    return `${main} — ${details}`;
  }
  return main;
};

const isParamFormatError = (errMsg) => {
  const s = String(errMsg || "").toLowerCase();
  return (
    s.includes("#132012") ||
    s.includes("#132018") ||
    s.includes("parameter format") ||
    s.includes("format mismatch") ||
    s.includes("format does not match")
  );
};

const isHeaderImageError = (errMsg) => {
  const s = String(errMsg || "").toLowerCase();
  return (
    s.includes("header") &&
    (s.includes("image") || s.includes("unknown") || s.includes("expected image"))
  );
};

const STRUCTURAL_PARAM_KEYS = new Set([
  "messaging_product",
  "recipient_type",
  "type",
  "template.name",
  "template.language.code",
  "template.language",
]);

const parseParamValue = (raw, candidate, { resolve = true } = {}) => {
  if (raw == null) return "";
  const asString = String(raw);
  if (!resolve) return asString;
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
    const key = String(param.key).trim();
    // Never run placeholder resolution on template name / structural fields.
    // Template can be named "unfilled_fields" which collides with {{unfilled_fields}}.
    const skipResolve = STRUCTURAL_PARAM_KEYS.has(key);
    setNestedValue(
      payload,
      key,
      parseParamValue(param.value, candidate, { resolve: !skipResolve })
    );
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
    isEnabled: isApiEnabled(plain),
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

const MSG_CONFIG_SLOTS_BACKEND = [
  {
    id: "msg-client-welcome",
    audience: "client",
    name: "Client Welcome",
  },
  {
    id: "msg-customer-welcome",
    audience: "candidate",
    name: "Customer Welcome",
  },
  {
    id: "msg-customer-unfilled",
    audience: "candidate",
    name: "Customer Unfilled Fields",
  },
];

const remapLegacySavedApi = (api) => {
  if (!api) return api;
  const next = { ...api };
  if (next.id === "msg-welcome-both" || next.audience === "both") {
    next.id = "msg-customer-welcome";
    next.audience = "candidate";
  }
  if (next.id === "msg-candidate-welcome") {
    next.id = "msg-customer-welcome";
  }
  return next;
};

const mapApiRow = (api, slot) => ({
  id: slot?.id || api.id || newApiId(),
  name: api.name || slot?.name || "API Config",
  isEnabled: isApiEnabled(api),
  apiUrl: api.apiUrl || "",
  method: api.method || "POST",
  curlText: api.curlText || "",
  headers: Array.isArray(api.headers) ? api.headers : [],
  bodyParams: Array.isArray(api.bodyParams) ? api.bodyParams : [],
  countryCodePrefix: api.countryCodePrefix || "91",
  recipientKey: api.recipientKey || "to",
  parameterMode: api.parameterMode || "auto",
  audience: slot?.audience || getApiAudience(api),
});

const emptySlotApi = (slot) =>
  mapApiRow(
    {
      id: slot.id,
      name: slot.name,
      isEnabled: false,
      apiUrl: "",
      bodyParams: [],
      headers: [],
    },
    slot
  );

const normalizeApisToSlots = (saved) => {
  const list = Array.isArray(saved)
    ? saved.map(remapLegacySavedApi)
    : [];
  const usedIndexes = new Set();
  const pickUnused = () => {
    const idx = list.findIndex((_, i) => !usedIndexes.has(i));
    if (idx < 0) return null;
    usedIndexes.add(idx);
    return list[idx];
  };

  return MSG_CONFIG_SLOTS_BACKEND.map((slot) => {
    let matchIdx = list.findIndex(
      (a, i) => !usedIndexes.has(i) && a.id === slot.id
    );
    if (matchIdx >= 0) {
      usedIndexes.add(matchIdx);
      return mapApiRow(list[matchIdx], slot);
    }
    matchIdx = list.findIndex(
      (a, i) => !usedIndexes.has(i) && a.audience === slot.audience
    );
    if (matchIdx >= 0) {
      usedIndexes.add(matchIdx);
      return mapApiRow(list[matchIdx], slot);
    }
    const match = pickUnused();
    if (match) return mapApiRow(match, slot);
    return emptySlotApi(slot);
  });
};

/** Normalize stored doc → { apis: [...] } with legacy migration */
exports.normalizeConfigDoc = (config) => {
  if (!config) {
    return { id: CONFIG_ID, apis: normalizeApisToSlots([]) };
  }
  const plain =
    typeof config.toObject === "function" ? config.toObject() : { ...config };

  if (Array.isArray(plain.apis) && plain.apis.length > 0) {
    return {
      id: plain.id || CONFIG_ID,
      apis: normalizeApisToSlots(plain.apis),
    };
  }

  // Migrate legacy single config if it has useful data
  if (plain.apiUrl || plain.securityKey || (plain.bodyParams || []).length) {
    return {
      id: plain.id || CONFIG_ID,
      apis: normalizeApisToSlots([legacyToApi(plain)]),
    };
  }

  return { id: plain.id || CONFIG_ID, apis: normalizeApisToSlots([]) };
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

  if (!isApiEnabled(api)) {
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

    // Read template identity from RAW config — never run placeholder resolution on these.
    // Template can be named "unfilled_fields" which collides with {{unfilled_fields}} placeholder.
    const getRawParam = (key) => {
      const row = (api.bodyParams || []).find(
        (p) => String(p?.key || "").trim() === key
      );
      return row?.value != null ? String(row.value).trim() : "";
    };
    const rawTemplateName = getRawParam("template.name");
    const rawLangCode = getRawParam("template.language.code") || "en";

    let payload = buildPayloadFromParams(api.bodyParams, candidate);
    const recipientKey = api.recipientKey || "to";
    setNestedValue(payload, recipientKey, to);

    // Lock template identity BEFORE any further mutation
    const lockedTemplateName = String(payload?.template?.name || "").trim();
    const lockedTemplateLanguage = payload?.template?.language
      ? { ...payload.template.language }
      : null;

    // Only resolve placeholders inside components — never re-process template.name
    if (payload?.template?.components) {
      payload.template.components = deepResolvePlaceholders(
        payload.template.components,
        candidate
      );
    }

    if (payload?.template) {
      if (lockedTemplateName) payload.template.name = lockedTemplateName;
      if (lockedTemplateLanguage) {
        payload.template.language = lockedTemplateLanguage;
      }
    }

    const parameterMode = api.parameterMode || "auto";
    let sanitized = sanitizeTemplatePayload(payload, {
      parameterMode,
      candidateId: candidate?.id,
      candidate,
    });

    // Enforce lock again after sanitize
    if (sanitized?.payload?.template && lockedTemplateName) {
      sanitized.payload.template.name = lockedTemplateName;
      if (lockedTemplateLanguage) {
        sanitized.payload.template.language = lockedTemplateLanguage;
      }
    }

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

    const forceTemplateIdentity = (data) => {
      if (!data || typeof data !== "object") return data;
      const next = { ...data };
      const tpl = { ...(next.template || {}) };
      if (rawTemplateName) tpl.name = rawTemplateName;
      tpl.language = {
        ...(tpl.language || {}),
        code: rawLangCode,
      };
      next.template = tpl;
      return next;
    };

    let finalPayload = forceTemplateIdentity(sanitized.payload);
    let usedNamed = sanitized.useNamed;

    console.info(
      "Msg API final template.name =>",
      finalPayload?.template?.name,
      "| api:",
      api.name
    );
    console.info(
      "Msg API payload template.components =>",
      JSON.stringify(finalPayload?.template?.components || null)
    );

    const headers = buildHeaders(api.headers);
    const method = (api.method || "POST").toLowerCase();
    const agent = new https.Agent({ rejectUnauthorized: false });

    const doRequest = async (data) => {
      // Always re-apply identity right before HTTP call (retries included)
      const safeData = forceTemplateIdentity(data);
      const axiosConfig = {
        method,
        url: api.apiUrl,
        headers,
        httpsAgent: agent,
        timeout: 45000,
      };
      if (method === "get") {
        axiosConfig.params = safeData;
      } else {
        axiosConfig.data = safeData;
      }
      return axios(axiosConfig);
    };

    // Soft WhatsApp error inside HTTP 200 (bridge often wraps Meta errors this way)
    const readSoftError = (data) => {
      if (!data) return null;
      const nested =
        data?.error?.message ||
        data?.message ||
        data?.error_user_msg ||
        (typeof data?.error === "string" ? data.error : null);
      const details =
        data?.error?.error_data?.details ||
        data?.error_data?.details ||
        data?.details ||
        "";
      if (!nested && !details) return null;
      const combined = details && nested && !String(nested).includes(String(details))
        ? `${nested} — ${details}`
        : nested || details;
      if (
        isParamFormatError(combined) ||
        String(combined).includes("#132") ||
        String(combined).toLowerCase().includes("issue with the parameters") ||
        data?.error?.code
      ) {
        return typeof combined === "string"
          ? combined
          : nested?.message || JSON.stringify(combined);
      }
      return null;
    };

    const attemptSend = async (payloadToSend) => {
      try {
        const response = await doRequest(payloadToSend);
        const soft = readSoftError(response?.data);
        if (soft) {
          return { ok: false, error: soft, response: response?.data, payload: payloadToSend };
        }
        return { ok: true, response: response?.data, payload: payloadToSend };
      } catch (httpErr) {
        return {
          ok: false,
          error: extractWhatsappError(httpErr),
          response: httpErr?.response?.data,
          payload: payloadToSend,
        };
      }
    };

    let attempt = await attemptSend(finalPayload);

    // Retry ladder for #132012 / parameter format (works for HTTP 200 soft-error AND HTTP 4xx)
    if (!attempt.ok && parameterMode === "auto" && isParamFormatError(attempt.error)) {
      const retries = [
        { forceNamed: !usedNamed, forceFallbackImage: false, label: "opposite named/positional" },
        { forceNamed: false, forceFallbackImage: true, label: "positional + fallback image" },
        { forceNamed: true, forceFallbackImage: true, label: "named + fallback image" },
      ];

      for (const r of retries) {
        // Skip duplicate of first attempt
        if (
          r.forceNamed === usedNamed &&
          !r.forceFallbackImage
        ) {
          continue;
        }
        // If error is clearly not image-related, skip image-only retries after format flip tried
        if (
          r.forceFallbackImage &&
          !isHeaderImageError(attempt.error) &&
          !isParamFormatError(attempt.error)
        ) {
          continue;
        }

        const retry = sanitizeTemplatePayload(payload, {
          parameterMode,
          forceNamed: r.forceNamed,
          forceFallbackImage: r.forceFallbackImage,
          candidateId: candidate?.id,
          candidate,
        });
        if (retry.error || !retry.payload) continue;

        console.info(
          "Msg API retry =>",
          api.name,
          "|",
          r.label,
          "| forceNamed:",
          r.forceNamed
        );
        attempt = await attemptSend(retry.payload);
        finalPayload = retry.payload;
        usedNamed = retry.useNamed;
        if (attempt.ok) break;
        if (!isParamFormatError(attempt.error) && !isHeaderImageError(attempt.error)) {
          break;
        }
      }
    }

    if (!attempt.ok) {
      await logMessage({
        candidateId: candidate?.id,
        mobile: to,
        status: "failed",
        requestPayload: finalPayload,
        response: attempt.response,
        error: attempt.error,
        ...apiMeta,
      });
      console.info("sendWelcomeWhatsapp soft-error =>", api.name, attempt.error);
      return { success: false, error: attempt.error, ...apiMeta };
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
      response: attempt.response,
      ...apiMeta,
    });

    return { success: true, data: attempt.response, ...apiMeta };
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

/** Call every enabled cURL/API config for this candidate.
 *  ONLY allowed on create — profile edit/update must never send.
 *  Even if 2+ cURLs are enabled, update/edit calls are fully blocked
 *  (zero APIs fire). Create calls all enabled APIs sequentially.
 */
exports.sendWelcomeWhatsapp = async (candidateInput, options = {}) => {
  const trigger = options && options.trigger;
  if (trigger !== "create") {
    console.info(
      "Msg API BLOCKED — profile edit/update must not send. Enabled cURLs ignored. Got trigger:",
      trigger || "(none)",
      "| candidateId:",
      candidateInput?.id || candidateInput?._id || "(unknown)"
    );
    return {
      skipped: true,
      reason: "not_create_trigger",
      msgApiPolicy: "create_only",
      blockedApis: true,
    };
  }

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
      let fresh =
        (await Candidates.findOne({ id: String(cid) }).lean()) ||
        (await Candidates.findOne({ _id: String(cid) }).lean()) ||
        (mongoose.Types.ObjectId.isValid(cid)
          ? await Candidates.findById(cid).lean()
          : null);

      // Create race: tiny wait + re-fetch if name still empty
      if (fresh && !pickStr(fresh.firstname, fresh.lastname, fresh.name)) {
        await new Promise((r) => setTimeout(r, 400));
        fresh =
          (await Candidates.findOne({ id: String(cid) }).lean()) ||
          fresh;
      }

      if (fresh) {
        // DB row wins for identity fields (avoids empty strings from create race)
        candidate = {
          ...candidate,
          ...fresh,
          id: fresh.id || cid,
          firstname: pickStr(
            fresh.firstname,
            fresh.firstName,
            fresh.first_name,
            candidate.firstname,
            candidate.firstName
          ),
          lastname: pickStr(
            fresh.lastname,
            fresh.lastName,
            fresh.last_name,
            candidate.lastname,
            candidate.lastName
          ),
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
      candidate?._agencySlug || "(none)",
      "profile_link:",
      buildCandidateProfileLink(candidate) || "(empty)"
    );
  } catch (enrichErr) {
    console.info(
      "Msg API candidate enrich error =>",
      enrichErr?.message || enrichErr
    );
  }

  const config = await exports.getWelcomeWhatsappConfig();
  const apis = Array.isArray(config.apis) ? config.apis : [];
  const enabledApis = apis.filter(
    (a) => isApiEnabled(a) && apiMatchesTrigger(a, "candidate")
  );

  console.info(
    "Msg API enabled configs =>",
    enabledApis.length,
    "/",
    apis.length,
    enabledApis.map((a) => a.name || a.id).join(", ") || "(none)"
  );

  if (enabledApis.length === 0) {
    await logMessage({
      candidateId: candidate?.id,
      mobile: candidate?.mobile,
      status: "skipped",
      error: "No enabled Msg API — turn on at least one cURL config",
    });
    return { skipped: true, reason: "no_enabled_apis" };
  }

  // Sequential + short gap — WhatsApp often drops/rejects back-to-back sends to same number
  const gapMs = getMultiApiGapMs();
  const results = [];
  for (let i = 0; i < enabledApis.length; i += 1) {
    const api = enabledApis[i];
    if (i > 0 && gapMs > 0) {
      await delay(gapMs);
    }
    try {
      const result = await sendSingleApi(api, candidate);
      results.push(result);
    } catch (err) {
      results.push({
        success: false,
        error: err?.message || "Unknown error",
        apiId: api?.id,
        apiName: api?.name,
      });
    }
  }

  console.info(
    "Msg API batch done =>",
    results
      .map((r) => `${r.apiName || r.apiId || "?"}:${r.success ? "ok" : r.skipped ? "skip" : "fail"}`)
      .join(" | ")
  );

  return { success: results.some((r) => r.success), results };
};

/**
 * Client add → same Super Admin Msg API configs (separate config per template).
 */
exports.sendClientWelcomeWhatsapp = async (clientInput) => {
  const client =
    clientInput && typeof clientInput.toObject === "function"
      ? clientInput.toObject()
      : clientInput || {};

  const person = {
    id: client.id || client._id,
    firstname: pickStr(client.companyowner, client.companyOwner, client.companyName),
    lastname: "",
    name: pickStr(client.companyowner, client.companyName),
    mobile: pickStr(client.mobile, client.phone),
    email: pickStr(client.email),
    city: pickStr(client.city),
    companyName: pickStr(client.companyName),
    companyowner: pickStr(client.companyowner, client.companyOwner),
    agencyId: client.agencyId,
  };

  const config = await exports.getWelcomeWhatsappConfig();
  const apis = Array.isArray(config.apis) ? config.apis : [];
  const enabledApis = apis.filter(
    (a) => isApiEnabled(a) && apiMatchesTrigger(a, "client")
  );

  console.info(
    "Client Msg API enabled configs =>",
    enabledApis.length,
    "/",
    apis.length,
    enabledApis.map((a) => a.name || a.id).join(", ") || "(none)",
    "| mobile:",
    person.mobile || "(empty)"
  );

  if (enabledApis.length === 0) {
    await logMessage({
      candidateId: person.id,
      mobile: person.mobile,
      status: "skipped",
      error: "No enabled Msg API — turn on at least one cURL config",
    });
    return { skipped: true, reason: "no_enabled_apis" };
  }

  const gapMs = getMultiApiGapMs();
  const results = [];
  for (let i = 0; i < enabledApis.length; i += 1) {
    const api = enabledApis[i];
    if (i > 0 && gapMs > 0) {
      await delay(gapMs);
    }
    try {
      const result = await sendSingleApi(api, person);
      results.push(result);
    } catch (err) {
      results.push({
        success: false,
        error: err?.message || "Unknown error",
        apiId: api?.id,
        apiName: api?.name,
      });
    }
  }

  return { success: results.some((r) => r.success), results };
};

