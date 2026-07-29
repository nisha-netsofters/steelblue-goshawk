import { useEffect, useMemo, useState } from "react";
import {
  Badge,
  Button,
  Card,
  CardBody,
  Col,
  Collapse,
  FormGroup,
  Input,
  Label,
  Row,
  Spinner,
} from "reactstrap";
import { ChevronDown, ChevronRight, Plus, Trash2 } from "react-feather";
import Swal from "sweetalert2";
import {
  getWelcomeWhatsappConfig,
  saveWelcomeWhatsappConfig,
  getWelcomeWhatsappLogs,
  deleteWelcomeWhatsappLogs,
  clearWelcomeWhatsappLogs,
  uploadWelcomeWhatsappImage,
} from "../../../apis/welcomeWhatsapp";
import { tostify, tostifySuccess } from "../../../components/Tostify";
import { SERVER_URL } from "../../../configs/config";
import { resolveAssetUrl } from "../../../utility/resolveAssetUrl";

const DEFAULT_HEADERS = [
  { key: "Content-Type", value: "application/json" },
  { key: "Accept", value: "application/json" },
  { key: "x-security-key", value: "" },
];

const DEFAULT_BODY_PARAMS = [
  { key: "messaging_product", value: "whatsapp" },
  { key: "recipient_type", value: "individual" },
  { key: "type", value: "template" },
  { key: "template.name", value: "uwp_hiring" },
  { key: "template.language.code", value: "en" },
];

/** Match Value options shown to clients (maps to {{placeholders}} or static input) */
const MATCH_OPTIONS = [
  { label: "Use Input Value", value: "input" },
  { label: "First Name", value: "firstname" },
  { label: "Last Name", value: "lastname" },
  { label: "Contact Name", value: "fullname" },
  { label: "Mobile", value: "mobile" },
  { label: "Email", value: "email" },
  { label: "City", value: "city" },
  { label: "Candidate Image", value: "image" },
  { label: "Resume URL", value: "resume" },
  { label: "Unfilled Fields", value: "unfilled_fields" },
];

const MATCH_TO_PLACEHOLDER = {
  firstname: "{{firstname}}",
  lastname: "{{lastname}}",
  fullname: "{{fullname}}",
  mobile: "{{mobile}}",
  email: "{{email}}",
  city: "{{city}}",
  image: "{{image}}",
  resume: "{{resume}}",
  unfilled_fields: "{{unfilled_fields}}",
};

const newApiId = () =>
  `api_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const createEmptyApi = (index = 0) => ({
  id: newApiId(),
  name: `API Config ${index + 1}`,
  isEnabled: false,
  apiUrl: "https://wa2.netsofters.com/api/external-api-bridge/send-message",
  method: "POST",
  curlText: "",
  headers: DEFAULT_HEADERS.map((h) => ({ ...h })),
  bodyParams: DEFAULT_BODY_PARAMS.map((p) => ({ ...p })),
  countryCodePrefix: "91",
  recipientKey: "to",
  // auto strips body_1 style names (fixes WhatsApp #132012 on positional templates)
  parameterMode: "auto",
});

const flattenObject = (obj, prefix = "") => {
  const rows = [];
  if (obj == null || typeof obj !== "object") return rows;
  Object.entries(obj).forEach(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      const nested = flattenObject(value, path);
      if (nested.length > 0) rows.push(...nested);
      else rows.push({ key: path, value: JSON.stringify(value) });
    } else if (Array.isArray(value)) {
      rows.push({ key: path, value: JSON.stringify(value, null, 2) });
    } else {
      rows.push({ key: path, value: value == null ? "" : String(value) });
    }
  });
  return rows;
};

const tokenizeCurl = (raw) => {
  const cleaned = String(raw || "")
    .replace(/\\\r?\n/g, " ")
    .replace(/\r?\n/g, " ")
    .trim();
  const tokens = [];
  let current = "";
  let quote = null;
  for (let i = 0; i < cleaned.length; i += 1) {
    const ch = cleaned[i];
    if (quote) {
      if (ch === quote) quote = null;
      else if (ch === "\\" && i + 1 < cleaned.length) {
        current += cleaned[i + 1];
        i += 1;
      } else current += ch;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      continue;
    }
    if (/\s/.test(ch)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    current += ch;
  }
  if (current) tokens.push(current);
  return tokens;
};

const parseCurlCommand = (rawCurl) => {
  const tokens = tokenizeCurl(rawCurl);
  if (!tokens.length) throw new Error("Empty cURL command");

  let method = "POST";
  let apiUrl = "";
  const headers = [];
  let bodyRaw = null;
  const takeNext = (i) => (i + 1 < tokens.length ? tokens[i + 1] : null);

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    const lower = token.toLowerCase();
    if (lower === "curl") continue;
    if (lower === "-x" || lower === "--request") {
      const next = takeNext(i);
      if (next) {
        method = next.toUpperCase();
        i += 1;
      }
      continue;
    }
    if (lower === "-h" || lower === "--header") {
      const next = takeNext(i);
      if (next) {
        const sep = next.indexOf(":");
        if (sep > 0) {
          headers.push({
            key: next.slice(0, sep).trim(),
            value: next.slice(sep + 1).trim(),
          });
        }
        i += 1;
      }
      continue;
    }
    if (
      ["-d", "--data", "--data-raw", "--data-binary", "--data-ascii"].includes(
        lower
      )
    ) {
      const next = takeNext(i);
      if (next != null) {
        bodyRaw = next;
        i += 1;
      }
      continue;
    }
    if (
      [
        "-s",
        "--silent",
        "-k",
        "--insecure",
        "-L",
        "--location",
        "-i",
        "--include",
        "-v",
        "--verbose",
        "-g",
        "--globoff",
        "--compressed",
      ].includes(lower)
    ) {
      continue;
    }
    if (lower.startsWith("-")) {
      const next = takeNext(i);
      if (next && !next.startsWith("-") && !/^https?:\/\//i.test(next)) i += 1;
      continue;
    }
    if (/^https?:\/\//i.test(token) || token.startsWith("/")) apiUrl = token;
  }

  if (!apiUrl) throw new Error("Could not find API URL in cURL");
  if (bodyRaw != null && !tokens.some((t) => /^-X$|^--request$/i.test(t))) {
    method = "POST";
  }

  let bodyParams = [];
  let recipientKey = "to";
  let countryCodePrefix = "91";

  if (bodyRaw) {
    let parsed;
    try {
      parsed = JSON.parse(bodyRaw);
    } catch (e) {
      throw new Error("cURL body (-d) is not valid JSON");
    }
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      if (Object.prototype.hasOwnProperty.call(parsed, "to")) {
        recipientKey = "to";
        const toVal = String(parsed.to || "").replace(/\D/g, "");
        if (toVal.length > 10) {
          countryCodePrefix = toVal.slice(0, toVal.length - 10);
        }
        delete parsed.to;
      }
      bodyParams = flattenObject(parsed);
    } else {
      bodyParams = [{ key: "body", value: bodyRaw }];
    }
  }

  return {
    apiUrl,
    method,
    headers: headers.length ? headers : DEFAULT_HEADERS.map((h) => ({ ...h })),
    bodyParams: bodyParams.length
      ? bodyParams
      : DEFAULT_BODY_PARAMS.map((p) => ({ ...p })),
    recipientKey,
    countryCodePrefix: countryCodePrefix || "91",
  };
};

const getParamValue = (bodyParams, key) => {
  const row = (bodyParams || []).find((p) => p.key === key);
  return row?.value ?? "";
};

const setParamValue = (bodyParams, key, value) => {
  const list = [...(bodyParams || [])];
  const idx = list.findIndex((p) => p.key === key);
  if (idx >= 0) list[idx] = { ...list[idx], value };
  else list.push({ key, value });
  return list;
};

const parseComponents = (bodyParams) => {
  const raw = getParamValue(bodyParams, "template.components");
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
};

const textToMatch = (text) => {
  const t = String(text || "").trim();
  const found = Object.entries(MATCH_TO_PLACEHOLDER).find(
    ([, ph]) => ph === t
  );
  if (found) return { matchType: found[0], inputValue: "" };
  return { matchType: "input", inputValue: t };
};

const matchToText = (matchType, inputValue) => {
  if (matchType === "input") return inputValue || "";
  return MATCH_TO_PLACEHOLDER[matchType] || inputValue || "";
};

/** Extract body vars + image from template.components for easy UI */
const extractTemplateUI = (bodyParams) => {
  const components = parseComponents(bodyParams);
  const bodyVars = [];
  let imageLink = "";

  components.forEach((comp) => {
    if (comp?.type === "body" && Array.isArray(comp.parameters)) {
      comp.parameters.forEach((p, i) => {
        const name = p.parameter_name || `body_${i + 1}`;
        const mapped = textToMatch(p.text);
        bodyVars.push({
          parameterName: name,
          matchType: mapped.matchType,
          inputValue: mapped.inputValue || (mapped.matchType === "input" ? p.text || "" : ""),
        });
      });
    }
    if (comp?.type === "header" && Array.isArray(comp.parameters)) {
      comp.parameters.forEach((p) => {
        if (p?.type === "image") {
          const link =
            (p.image && p.image.link) ||
            (typeof p.image === "string" ? p.image : "") ||
            p.link ||
            "";
          imageLink = link;
        }
      });
    }
  });

  const imageMapped = textToMatch(imageLink);
  return {
    bodyVars,
    image: {
      matchType: imageMapped.matchType === "input" ? "input" : imageMapped.matchType,
      inputValue:
        imageMapped.matchType === "input" ? imageLink : imageMapped.inputValue,
      hasImageSlot: Boolean(
        components.some(
          (c) =>
            c?.type === "header" &&
            Array.isArray(c.parameters) &&
            c.parameters.some((p) => p?.type === "image")
        )
      ),
    },
  };
};

/** Write body vars + image back into template.components JSON */
const rebuildComponents = (bodyParams, bodyVars, imageCfg) => {
  let components = parseComponents(bodyParams);

  if (!components.length && (bodyVars.length || imageCfg?.hasImageSlot)) {
    components = [];
    if (imageCfg?.hasImageSlot) {
      components.push({
        type: "header",
        parameters: [
          {
            type: "image",
            image: { link: matchToText(imageCfg.matchType, imageCfg.inputValue) },
          },
        ],
      });
    }
    if (bodyVars.length) {
      components.push({
        type: "body",
        parameters: bodyVars.map((v) => ({
          type: "text",
          parameter_name: v.parameterName,
          text: matchToText(v.matchType, v.inputValue),
        })),
      });
    }
  } else {
    components = components.map((comp) => {
      if (comp?.type === "body") {
        return {
          ...comp,
          parameters: bodyVars.map((v) => ({
            type: "text",
            parameter_name: v.parameterName,
            text: matchToText(v.matchType, v.inputValue),
          })),
        };
      }
      if (comp?.type === "header" && Array.isArray(comp.parameters)) {
        return {
          ...comp,
          parameters: comp.parameters.map((p) => {
            if (p?.type !== "image") return p;
            const link = matchToText(imageCfg.matchType, imageCfg.inputValue);
            return {
              ...p,
              image:
                typeof p.image === "object" && p.image
                  ? { ...p.image, link }
                  : { link },
            };
          }),
        };
      }
      return comp;
    });
  }

  return setParamValue(
    bodyParams,
    "template.components",
    JSON.stringify(components, null, 2)
  );
};

const normalizeApis = (data) => {
  if (Array.isArray(data?.apis) && data.apis.length > 0) {
    return data.apis.map((api, idx) => {
      const base = {
        ...createEmptyApi(idx),
        ...api,
        id: api.id || newApiId(),
        name: api.name || `API Config ${idx + 1}`,
        headers:
          Array.isArray(api.headers) && api.headers.length
            ? api.headers
            : DEFAULT_HEADERS.map((h) => ({ ...h })),
        bodyParams:
          Array.isArray(api.bodyParams) && api.bodyParams.length
            ? api.bodyParams
            : DEFAULT_BODY_PARAMS.map((p) => ({ ...p })),
      };
      // Always keep URL visible in Paste full cURL box
      if (!String(base.curlText || "").trim() && base.apiUrl) {
        base.curlText = `curl -s -X ${base.method || "POST"} '${base.apiUrl}'`;
      }
      return base;
    });
  }
  if (data?.apiUrl) {
    return [
      {
        ...createEmptyApi(0),
        isEnabled: data.isEnabled ?? false,
        apiUrl: data.apiUrl,
        method: data.method || "POST",
        headers:
          Array.isArray(data.headers) && data.headers.length
            ? data.headers
            : DEFAULT_HEADERS.map((h) => ({ ...h })),
        bodyParams:
          Array.isArray(data.bodyParams) && data.bodyParams.length
            ? data.bodyParams
            : DEFAULT_BODY_PARAMS.map((p) => ({ ...p })),
        countryCodePrefix: data.countryCodePrefix || "91",
        recipientKey: data.recipientKey || "to",
      },
    ];
  }
  return [createEmptyApi(0)];
};

const faqHeaderStyle = {
  display: "flex",
  alignItems: "center",
  gap: "10px",
  width: "100%",
  padding: "14px 16px",
  background: "#f8f9fa",
  border: "1px solid #e9ecef",
  borderRadius: "8px",
  cursor: "pointer",
  userSelect: "none",
};

const TemplateEasyEditor = ({ api, onChangeBodyParams, onUploadImage }) => {
  const ui = useMemo(
    () => extractTemplateUI(api.bodyParams),
    [api.bodyParams]
  );
  const [uploadingImg, setUploadingImg] = useState(false);

  const updateBodyVar = (index, patch) => {
    const nextVars = ui.bodyVars.map((v, i) =>
      i === index ? { ...v, ...patch } : v
    );
    onChangeBodyParams(rebuildComponents(api.bodyParams, nextVars, ui.image));
  };

  const updateImage = (patch) => {
    // Only update image when cURL already has a header image component
    if (!ui.image.hasImageSlot) return;
    const nextImage = { ...ui.image, ...patch, hasImageSlot: true };
    onChangeBodyParams(
      rebuildComponents(api.bodyParams, ui.bodyVars, nextImage)
    );
  };

  const handleSelectImg = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingImg(true);
    try {
      const url = await onUploadImage(file);
      if (url) {
        updateImage({ matchType: "input", inputValue: url });
        const isPublicHttps =
          /^https:\/\//i.test(url) && !/localhost|127\.0\.0\.1/i.test(url);
        if (isPublicHttps) {
          tostifySuccess("Image saved");
        } else {
          // Only warn on local dev — live always rewrites to public API host
          tostify(
            "Local image saved — WhatsApp needs a public https URL. Paste CDN link above, or send will use a default public image."
          );
        }
      }
    } catch (err) {
      tostify(err?.message || "Image upload failed");
    } finally {
      setUploadingImg(false);
      e.target.value = "";
    }
  };

  const selectedImgName = (() => {
    const link = ui.image.inputValue || "";
    if (!link) return "";
    try {
      return decodeURIComponent(link.substring(link.lastIndexOf("/") + 1));
    } catch (err) {
      return link;
    }
  })();

  return (
    <>
      {/* Body mappings */}
      <h5 className="mt-1 mb-1">Body</h5>
      <hr className="mt-0 mb-1" />
      {ui.bodyVars.length === 0 ? (
        <p className="text-muted small">
          cURL parse pachi <code>body_1</code>, <code>body_2</code>… ahiya auto
          dekhase. Pehla upar cURL paste kari Parse karo.
        </p>
      ) : (
        ui.bodyVars.map((v, index) => (
          <Row key={v.parameterName} className="mb-1 align-items-end">
            <Col md="6">
              <FormGroup className="mb-0">
                <Label>Match Value {index + 1}</Label>
                <Input
                  type="select"
                  value={v.matchType}
                  onChange={(e) =>
                    updateBodyVar(index, { matchType: e.target.value })
                  }
                >
                  {MATCH_OPTIONS.filter((o) => o.value !== "image").map(
                    (opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    )
                  )}
                </Input>
              </FormGroup>
            </Col>
            <Col md="6">
              {v.matchType === "input" ? (
                <FormGroup className="mb-0">
                  <Label>Variable {index + 1}</Label>
                  <Input
                    value={v.inputValue}
                    onChange={(e) =>
                      updateBodyVar(index, { inputValue: e.target.value })
                    }
                    placeholder={`Value for ${v.parameterName}`}
                  />
                </FormGroup>
              ) : (
                <FormGroup className="mb-0">
                  <Label>Variable {index + 1}</Label>
                  <Input
                    disabled
                    value={MATCH_TO_PLACEHOLDER[v.matchType] || ""}
                  />
                </FormGroup>
              )}
            </Col>
          </Row>
        ))
      )}

      {/* Image — only when cURL has header image */}
      {ui.image.hasImageSlot ? (
        <>
          <h5 className="mt-2 mb-1">Image</h5>
          <hr className="mt-0 mb-1" />
          <Row className="align-items-end">
            <Col md="4">
              <FormGroup>
                <Label>Header Image source</Label>
                <Input type="select" value="input" disabled>
                  <option value="input">Select img</option>
                </Input>
              </FormGroup>
            </Col>
            <Col md="8">
              <FormGroup>
                <Label>Image URL</Label>
                <Input
                  className="mb-50"
                  value={ui.image.inputValue || ""}
                  onChange={(e) =>
                    updateImage({
                      matchType: "input",
                      inputValue: e.target.value,
                    })
                  }
                  placeholder="https://… or choose file below"
                />
                <div className="d-flex align-items-center" style={{ gap: 8 }}>
                  <Input
                    type="file"
                    accept="image/png,image/jpeg,image/jpg,image/webp"
                    disabled={uploadingImg}
                    onChange={handleSelectImg}
                  />
                  {uploadingImg ? <Spinner size="sm" /> : null}
                </div>
                {selectedImgName ? (
                  <small className="text-muted d-block mt-50">
                    Selected: {selectedImgName}
                  </small>
                ) : null}
              </FormGroup>
            </Col>
          </Row>
        </>
      ) : null}
    </>
  );
};

const Msg = () => {
  const [apis, setApis] = useState([createEmptyApi(0)]);
  const [openFaq, setOpenFaq] = useState({ config: true, logs: true });
  const [openApiIds, setOpenApiIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [logs, setLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsPage, setLogsPage] = useState(1);
  const [logsPerPage] = useState(10);
  const [logsTotal, setLogsTotal] = useState(0);
  const [logsTotalPages, setLogsTotalPages] = useState(1);
  const [selectedLogIds, setSelectedLogIds] = useState([]);
  const [deletingLogs, setDeletingLogs] = useState(false);

  const loadConfig = async () => {
    setLoading(true);
    try {
      const data = await getWelcomeWhatsappConfig();
      if (data?.msg === "invalid token or expired token") {
        tostify("Session expired. Please login again.");
        return;
      }
      if (data?.error) {
        tostify(data.error);
        return;
      }
      const nextApis = normalizeApis(data);
      setApis(nextApis);
      setOpenApiIds([]);
    } catch (err) {
      tostify(
        err?.response?.data?.error || "Failed to load message configuration"
      );
    } finally {
      setLoading(false);
    }
  };

  const loadLogs = async (page = logsPage) => {
    setLogsLoading(true);
    try {
      const data = await getWelcomeWhatsappLogs(page, logsPerPage);
      if (data?.msg === "invalid token or expired token") return;
      setLogs(data?.data || []);
      setLogsTotal(data?.total || 0);
      setLogsTotalPages(data?.totalPages || 1);
      setLogsPage(data?.page || page);
      setSelectedLogIds([]);
    } catch (err) {
      setLogs([]);
    } finally {
      setLogsLoading(false);
    }
  };

  useEffect(() => {
    loadConfig();
    loadLogs(1);
  }, []);

  const toggleFaq = (key) => {
    setOpenFaq((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleApi = (id) => {
    setOpenApiIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const updateApi = (apiId, field, value) => {
    setApis((prev) =>
      prev.map((api) =>
        api.id === apiId ? { ...api, [field]: value } : api
      )
    );
  };

  const handleAddApi = () => {
    const next = createEmptyApi(apis.length);
    setApis((prev) => [...prev, next]);
    setOpenApiIds((prev) => [...prev, next.id]);
    setOpenFaq((prev) => ({ ...prev, config: true }));
  };

  const handleRemoveApi = async (apiId) => {
    if (apis.length <= 1) {
      return tostify("At least one cURL config is required");
    }
    const api = apis.find((a) => a.id === apiId);
    const result = await Swal.fire({
      title: "Delete cURL config?",
      text: `"${api?.name || "This config"}" will be removed.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#ea5455",
      cancelButtonColor: "#82868b",
    });
    if (!result.isConfirmed) return;
    setApis((prev) => prev.filter((a) => a.id !== apiId));
    setOpenApiIds((prev) => prev.filter((id) => id !== apiId));
    tostifySuccess("cURL config removed — click Save Configuration to apply");
  };

  const handleParseCurl = (apiId) => {
    const api = apis.find((a) => a.id === apiId);
    const pastedCurl = api?.curlText || "";
    if (!pastedCurl.trim()) {
      return tostify("Please paste a cURL command first");
    }
    try {
      const parsed = parseCurlCommand(pastedCurl);
      setApis((prev) =>
        prev.map((a) =>
          a.id === apiId
            ? {
                ...a,
                // Keep exact pasted cURL visible in the textarea
                curlText: pastedCurl,
                apiUrl: parsed.apiUrl,
                method: parsed.method,
                headers: parsed.headers,
                bodyParams: parsed.bodyParams,
                recipientKey: parsed.recipientKey || a.recipientKey,
                countryCodePrefix:
                  parsed.countryCodePrefix || a.countryCodePrefix,
              }
            : a
        )
      );
      tostifySuccess(
        `cURL parsed — URL: ${parsed.apiUrl}`
      );
    } catch (err) {
      tostify(err?.message || "Failed to parse cURL command");
    }
  };

  const handleUploadImage = async (file) => {
    const fm = new FormData();
    fm.append("image", file);
    const resp = await uploadWelcomeWhatsappImage(fm);
    if (resp?.msg === "invalid token or expired token") {
      throw new Error("Session expired. Please login again.");
    }
    if (!resp?.url) {
      throw new Error(resp?.error || "Upload failed");
    }
    // Prefer absolute URL for WhatsApp header image
    let absolute =
      resolveAssetUrl(resp.url) ||
      (String(resp.url).startsWith("http")
        ? resp.url
        : `${String(SERVER_URL).replace(/\/api\/?$/, "")}${resp.url}`);
    // Live site: rewrite accidental localhost URLs to public API host
    const apiHost = String(SERVER_URL).replace(/\/api\/?$/, "");
    if (
      absolute &&
      /localhost|127\.0\.0\.1/i.test(absolute) &&
      !/localhost|127\.0\.0\.1/i.test(apiHost)
    ) {
      const path = absolute.replace(/^https?:\/\/[^/]+/i, "");
      absolute = `${apiHost}${path.startsWith("/") ? path : `/${path}`}`;
    }
    return absolute;
  };

  const handleSave = async () => {
    for (const api of apis) {
      if (!api.apiUrl?.trim()) {
        return tostify(`"${api.name}" — API URL is required`);
      }
      const validBody = (api.bodyParams || []).filter((p) => p.key?.trim());
      if (!validBody.length) {
        return tostify(`"${api.name}" — parse a cURL first`);
      }
    }

    setSaving(true);
    try {
      const payload = {
        apis: apis.map((api, idx) => ({
          id: api.id,
          name: api.name || `API Config ${idx + 1}`,
          isEnabled: Boolean(api.isEnabled),
          apiUrl: api.apiUrl.trim(),
          method: api.method || "POST",
          curlText: api.curlText || "",
          headers: (api.headers || [])
            .filter((h) => h.key?.trim())
            .map((h) => ({ key: h.key.trim(), value: h.value ?? "" })),
          bodyParams: (api.bodyParams || [])
            .filter((p) => p.key?.trim())
            .map((p) => ({ key: p.key.trim(), value: p.value ?? "" })),
          countryCodePrefix: api.countryCodePrefix || "91",
          recipientKey: api.recipientKey || "to",
          parameterMode: api.parameterMode || "auto",
        })),
      };

      const resp = await saveWelcomeWhatsappConfig(payload);
      if (resp?.msg === "invalid token or expired token") {
        tostify("Session expired. Please login again.");
        return;
      }
      if (resp?.msg === "success") {
        tostifySuccess("Configuration saved");
        if (resp?.data) setApis(normalizeApis(resp.data));
      } else {
        tostify(resp?.error || "Failed to save configuration");
      }
    } catch (err) {
      tostify(
        err?.response?.data?.error || "Failed to save message configuration"
      );
    } finally {
      setSaving(false);
    }
  };

  const allLogsSelected =
    logs.length > 0 &&
    logs.every((l) => selectedLogIds.includes(l.id || l._id));

  const toggleSelectAllLogs = () => {
    if (allLogsSelected) setSelectedLogIds([]);
    else setSelectedLogIds(logs.map((l) => l.id || l._id).filter(Boolean));
  };

  const toggleSelectLog = (id) => {
    setSelectedLogIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleDeleteSelected = async () => {
    if (!selectedLogIds.length) {
      return tostify("Select at least one log to delete");
    }
    const result = await Swal.fire({
      title: "Delete selected logs?",
      text: `${selectedLogIds.length} log(s) will be permanently deleted.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#ea5455",
      cancelButtonColor: "#82868b",
    });
    if (!result.isConfirmed) return;

    setDeletingLogs(true);
    try {
      const resp = await deleteWelcomeWhatsappLogs(selectedLogIds);
      if (resp?.msg === "success") {
        tostifySuccess(`${resp.deleted || selectedLogIds.length} log(s) deleted`);
        const nextPage =
          logs.length === selectedLogIds.length && logsPage > 1
            ? logsPage - 1
            : logsPage;
        await loadLogs(nextPage);
      } else {
        tostify(resp?.error || "Failed to delete logs");
      }
    } catch (err) {
      tostify(err?.response?.data?.error || "Failed to delete logs");
    } finally {
      setDeletingLogs(false);
    }
  };

  const handleClearAll = async () => {
    const result = await Swal.fire({
      title: "Clear all logs?",
      text: "All send logs will be permanently deleted. This cannot be undone.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, clear all",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#ea5455",
      cancelButtonColor: "#82868b",
    });
    if (!result.isConfirmed) return;

    setDeletingLogs(true);
    try {
      const resp = await clearWelcomeWhatsappLogs();
      if (resp?.msg === "success") {
        tostifySuccess(`Cleared ${resp.deleted || 0} log(s)`);
        await loadLogs(1);
      } else {
        tostify(resp?.error || "Failed to clear logs");
      }
    } catch (err) {
      tostify(err?.response?.data?.error || "Failed to clear logs");
    } finally {
      setDeletingLogs(false);
    }
  };

  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center py-5">
        <Spinner color="primary" />
      </div>
    );
  }

  return (
    <>
      <div className="d-flex align-items-center mb-2">
        <h3 className="text-primary mb-0">
          <b>Msg API</b>
        </h3>
      </div>
      <p className="text-muted mb-2">
        cURL paste karo → Body / Image easy mapping. Technical fields Advanced
        ma chhe.
      </p>

      <Card className="mb-1 border-0 shadow-none">
        <div
          style={faqHeaderStyle}
          onClick={() => toggleFaq("config")}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && toggleFaq("config")}
        >
          {openFaq.config ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
          <strong className="flex-grow-1">1. API Configuration (cURL)</strong>
          <Badge color="primary" pill>
            {apis.length} config{apis.length > 1 ? "s" : ""}
          </Badge>
          <Button
            color="primary"
            size="sm"
            className="ml-1"
            onClick={(e) => {
              e.stopPropagation();
              handleAddApi();
            }}
          >
            <Plus size={14} className="mr-50" /> Add cURL Config
          </Button>
        </div>
        <Collapse isOpen={openFaq.config}>
          <CardBody className="pt-2 px-0">
            {apis.map((api, apiIndex) => {
              const isOpen = openApiIds.includes(api.id);

              return (
                <div key={api.id} className="mb-1" style={{ marginLeft: 4 }}>
                  <div
                    style={{
                      ...faqHeaderStyle,
                      background: isOpen ? "#eef3ff" : "#fff",
                      borderColor: isOpen ? "#c5d4f7" : "#e9ecef",
                    }}
                    onClick={() => toggleApi(api.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === "Enter" && toggleApi(api.id)}
                  >
                    {isOpen ? (
                      <ChevronDown size={16} />
                    ) : (
                      <ChevronRight size={16} />
                    )}
                    <span className="flex-grow-1">
                      <strong>
                        {apiIndex + 1}. {api.name || "Untitled API"}
                      </strong>
                      <small className="text-muted d-block text-truncate">
                        {getParamValue(api.bodyParams, "template.name") ||
                          api.apiUrl ||
                          "No URL yet"}
                      </small>
                    </span>
                    <div
                      className="form-switch form-check-primary"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Input
                        type="switch"
                        id={`api-enabled-${api.id}`}
                        checked={api.isEnabled}
                        onChange={(e) =>
                          updateApi(api.id, "isEnabled", e.target.checked)
                        }
                      />
                    </div>
                    <Button
                      color="danger"
                      size="sm"
                      outline
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveApi(api.id);
                      }}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>

                  <Collapse isOpen={isOpen}>
                    <div
                      className="p-2"
                      style={{
                        border: "1px solid #e9ecef",
                        borderTop: "none",
                        borderRadius: "0 0 8px 8px",
                      }}
                    >
                      <Row>
                        <Col md="6">
                          <FormGroup>
                            <Label>Config name</Label>
                            <Input
                              value={api.name}
                              onChange={(e) =>
                                updateApi(api.id, "name", e.target.value)
                              }
                              placeholder="e.g. Welcome Template"
                            />
                          </FormGroup>
                        </Col>
                      </Row>

                      <FormGroup>
                        <Label>Paste full cURL</Label>
                        <Input
                          type="textarea"
                          rows={6}
                          value={api.curlText || ""}
                          onChange={(e) =>
                            updateApi(api.id, "curlText", e.target.value)
                          }
                          placeholder="curl -s -X POST 'https://...' -H '...' -d '{...}'"
                        />
                        {api.apiUrl ? (
                          <small className="text-muted d-block mt-50">
                            API URL: <code>{api.apiUrl}</code>
                          </small>
                        ) : null}
                        <div className="d-flex justify-content-end mt-1">
                          <Button
                            color="primary"
                            size="sm"
                            onClick={() => handleParseCurl(api.id)}
                          >
                            Parse cURL
                          </Button>
                        </div>
                      </FormGroup>

                      <TemplateEasyEditor
                        api={api}
                        onChangeBodyParams={(nextParams) =>
                          updateApi(api.id, "bodyParams", nextParams)
                        }
                        onUploadImage={handleUploadImage}
                      />
                    </div>
                  </Collapse>
                </div>
              );
            })}

            <div className="d-flex justify-content-end align-items-center mt-2">
              <Button color="primary" onClick={handleSave} disabled={saving}>
                {saving ? <Spinner size="sm" /> : "Save Configuration"}
              </Button>
            </div>
          </CardBody>
        </Collapse>
      </Card>

      <Card className="mb-2 border-0 shadow-none">
        <div
          style={faqHeaderStyle}
          onClick={() => toggleFaq("logs")}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && toggleFaq("logs")}
        >
          {openFaq.logs ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
          <strong className="flex-grow-1">2. Recent Send Logs</strong>
          <Badge color="secondary" pill>
            {logsTotal}
          </Badge>
        </div>
        <Collapse isOpen={openFaq.logs}>
          <CardBody className="pt-2 px-0">
            <div
              className="d-flex flex-wrap align-items-center mb-1"
              style={{ gap: 8 }}
            >
              <Button
                color="danger"
                size="sm"
                outline
                disabled={deletingLogs || !selectedLogIds.length}
                onClick={handleDeleteSelected}
              >
                {deletingLogs ? (
                  <Spinner size="sm" />
                ) : (
                  <>
                    <Trash2 size={14} className="mr-50" /> Delete selected (
                    {selectedLogIds.length})
                  </>
                )}
              </Button>
              <Button
                color="danger"
                size="sm"
                disabled={deletingLogs || logsTotal === 0}
                onClick={handleClearAll}
              >
                Clear All
              </Button>
            </div>

            {logsLoading ? (
              <Spinner size="sm" color="primary" />
            ) : logs.length === 0 ? (
              <p className="text-muted mb-0">No messages sent yet.</p>
            ) : (
              <>
                <div className="table-responsive">
                  <table className="table table-sm">
                    <thead>
                      <tr>
                        <th style={{ width: 40 }}>
                          <Input
                            type="checkbox"
                            checked={allLogsSelected}
                            onChange={toggleSelectAllLogs}
                          />
                        </th>
                        <th>Date</th>
                        <th>API</th>
                        <th>Mobile</th>
                        <th>Status</th>
                        <th>Error</th>
                      </tr>
                    </thead>
                    <tbody>
                      {logs.map((log) => {
                        const id = log.id || log._id;
                        return (
                          <tr key={id}>
                            <td>
                              <Input
                                type="checkbox"
                                checked={selectedLogIds.includes(id)}
                                onChange={() => toggleSelectLog(id)}
                              />
                            </td>
                            <td>
                              {log.createdAt
                                ? new Date(log.createdAt).toLocaleString()
                                : "-"}
                            </td>
                            <td>{log.apiName || "-"}</td>
                            <td>{log.mobile || "-"}</td>
                            <td>
                              <span
                                className={`badge ${
                                  log.status === "success"
                                    ? "bg-success"
                                    : log.status === "skipped"
                                    ? "bg-warning"
                                    : "bg-danger"
                                }`}
                              >
                                {log.status || "-"}
                              </span>
                            </td>
                            <td
                              style={{
                                maxWidth: 280,
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                              }}
                              title={log.error || ""}
                            >
                              {log.error || "-"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="d-flex justify-content-between align-items-center mt-1">
                  <small className="text-muted">
                    Page {logsPage} of {logsTotalPages} · {logsTotal} total
                  </small>
                  <div>
                    <Button
                      color="primary"
                      size="sm"
                      outline
                      className="mr-1"
                      disabled={logsPage <= 1 || logsLoading}
                      onClick={() => loadLogs(logsPage - 1)}
                    >
                      Prev
                    </Button>
                    <Button
                      color="primary"
                      size="sm"
                      outline
                      disabled={logsPage >= logsTotalPages || logsLoading}
                      onClick={() => loadLogs(logsPage + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              </>
            )}
          </CardBody>
        </Collapse>
      </Card>
    </>
  );
};

export default Msg;
