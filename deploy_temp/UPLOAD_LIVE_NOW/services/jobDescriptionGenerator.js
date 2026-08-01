const axios = require("axios");
const { getActiveAiProvider } = require("../middleware/apiIntegration/configResolver");

const VALID_ACTIONS = [
  "generate",
  "regenerate",
  "improve",
  "short",
  "professional",
];

/**
 * Map raw AI/provider errors to user-friendly validation messages.
 */
function buildAiError(provider, status, apiMsg = "") {
  const msg = String(apiMsg || "").toLowerCase();
  const err = new Error();

  const isQuota =
    status === 429 ||
    msg.includes("rate limit") ||
    msg.includes("quota") ||
    msg.includes("resource_exhausted") ||
    msg.includes("resource exhausted") ||
    msg.includes("limit: 0") ||
    msg.includes("free_tier");

  if (isQuota) {
    const needsBilling =
      msg.includes("limit: 0") ||
      msg.includes("billing") ||
      msg.includes("free_tier");
    err.code = needsBilling ? "AI_BILLING_REQUIRED" : "AI_RATE_LIMIT";
    err.message = needsBilling
      ? "Gemini Free tier quota is 0 for this API key. Open Google AI Studio → Set up billing for the project, then try again. (Your API key itself is valid.)"
      : "AI service rate limit reached. Please wait a moment and try again.";
    return err;
  }

  const isAuthFailure =
    status === 401 ||
    status === 403 ||
    msg.includes("api key not valid") ||
    msg.includes("invalid api key") ||
    msg.includes("invalid authentication") ||
    msg.includes("unauthenticated") ||
    msg.includes("permission denied") ||
    msg.includes("api_key_invalid") ||
    (msg.includes("credential") && msg.includes("invalid"));

  if (isAuthFailure) {
    err.code = "AI_API_KEY_INVALID";
    err.message =
      "Invalid AI API Key. Please enter a valid Gemini API Key (AIza… or AQ.… from Google AI Studio) in Super Admin → OCR & API Configuration, then Save.";
    return err;
  }

  if (
    status === 404 ||
    msg.includes("not found") ||
    msg.includes("is not found") ||
    msg.includes("no longer available")
  ) {
    err.code = "AI_MODEL_INVALID";
    err.message =
      "Invalid AI Model. Please set a valid Model in Super Admin → OCR & API Configuration.";
    return err;
  }

  err.code = "AI_GENERATE_FAILED";
  err.message = `AI Job Description generation failed (${provider}). Please verify AI API Key and Model in Super Admin → OCR & API Configuration.`;
  return err;
}

function getEmptyJdResult() {
  return {
    jobSummary: "",
    responsibilities: "",
    requiredSkills: "",
    preferredSkills: "",
    qualification: "",
    benefits: "",
    companyOverview: "",
    callToAction: "",
    fullDescription: "",
  };
}

function composeFullDescription(sections) {
  const blocks = [];
  if (sections.jobSummary) {
    blocks.push(`Job Summary\n${sections.jobSummary}`);
  }
  if (sections.responsibilities) {
    blocks.push(`Responsibilities\n${sections.responsibilities}`);
  }
  if (sections.requiredSkills) {
    blocks.push(`Required Skills\n${sections.requiredSkills}`);
  }
  if (sections.preferredSkills) {
    blocks.push(`Preferred Skills\n${sections.preferredSkills}`);
  }
  if (sections.qualification) {
    blocks.push(`Qualification\n${sections.qualification}`);
  }
  if (sections.benefits) {
    blocks.push(`Benefits\n${sections.benefits}`);
  }
  if (sections.companyOverview) {
    blocks.push(`Company Overview\n${sections.companyOverview}`);
  }
  if (sections.callToAction) {
    blocks.push(`Call to Action\n${sections.callToAction}`);
  }
  return blocks.join("\n\n");
}

function normalizeJdResult(parsed) {
  const result = {
    ...getEmptyJdResult(),
    jobSummary: String(parsed?.jobSummary || "").trim(),
    responsibilities: String(parsed?.responsibilities || "").trim(),
    requiredSkills: String(parsed?.requiredSkills || "").trim(),
    preferredSkills: String(parsed?.preferredSkills || "").trim(),
    qualification: String(parsed?.qualification || "").trim(),
    benefits: String(parsed?.benefits || "").trim(),
    companyOverview: String(parsed?.companyOverview || "").trim(),
    callToAction: String(parsed?.callToAction || "").trim(),
  };
  result.fullDescription =
    String(parsed?.fullDescription || "").trim() ||
    composeFullDescription(result);
  return result;
}

function buildPrompt(input) {
  const {
    action = "generate",
    jobTitle = "",
    experience = "",
    skills = "",
    industry = "",
    location = "",
    employmentType = "",
    salary = "",
    existingContent = {},
  } = input;

  const actionInstructions = {
    generate:
      "Create a complete, compelling job description from the job inputs below. Do not reuse any previous draft unless provided.",
    regenerate:
      "Generate a fresh alternative job description with different wording and structure from the inputs. Avoid repeating previous phrasing.",
    improve:
      "Improve the existing draft below for clarity, impact, and hiring appeal while keeping the same intent and facts.",
    short:
      "Rewrite the job description into a concise short version. Keep essential information only. Aim for about 40-60% of a normal-length JD.",
    professional:
      "Rewrite the job description in a highly professional, corporate tone suitable for enterprise hiring.",
  };

  const existingBlock =
    action === "generate" || action === "regenerate"
      ? ""
      : `
Existing draft (edit/improve this):
${JSON.stringify(
  {
    jobSummary: existingContent.jobSummary || "",
    responsibilities: existingContent.responsibilities || "",
    requiredSkills: existingContent.requiredSkills || "",
    preferredSkills: existingContent.preferredSkills || "",
    qualification: existingContent.qualification || "",
    benefits: existingContent.benefits || "",
    companyOverview: existingContent.companyOverview || "",
    callToAction: existingContent.callToAction || "",
  },
  null,
  2
)}
`;

  return `You are an expert HR copywriter specializing in job descriptions.
Return a valid JSON object ONLY. Do not include markdown fences or explanation.

Action: ${action}
Instruction: ${actionInstructions[action] || actionInstructions.generate}

Job inputs:
- Job Title: ${jobTitle || "N/A"}
- Experience: ${experience || "N/A"}
- Skills: ${skills || "N/A"}
- Industry: ${industry || "N/A"}
- Location: ${location || "N/A"}
- Employment Type: ${employmentType || "N/A"}
- Salary: ${salary || "Not specified"}
${existingBlock}

JSON Schema (all values must be strings; use bullet lines with "- " for lists where useful):
{
  "jobSummary": "string",
  "responsibilities": "string",
  "requiredSkills": "string",
  "preferredSkills": "string",
  "qualification": "string",
  "benefits": "string",
  "companyOverview": "string",
  "callToAction": "string"
}`;
}

function getTemperature(action) {
  if (action === "regenerate") return 0.85;
  if (action === "improve" || action === "professional") return 0.45;
  if (action === "short") return 0.4;
  return 0.55;
}

async function queryOpenAi(prompt, credentials, temperature) {
  const { apiKey, model, baseUrl } = credentials;
  const url = `${baseUrl || "https://api.openai.com/v1"}/chat/completions`;

  const response = await axios.post(
    url,
    {
      model: model || "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      temperature,
      response_format: { type: "json_object" },
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    }
  );

  return response.data?.choices?.[0]?.message?.content || "";
}

async function queryGemini(prompt, credentials, temperature) {
  const apiKey = String(credentials.apiKey || "").trim();
  const preferred = String(credentials.model || "").trim();
  if (!apiKey) {
    const err = new Error(
      "Invalid AI API Key. Please enter a valid Gemini API Key in Super Admin → OCR & API Configuration."
    );
    err.code = "AI_API_KEY_INVALID";
    throw err;
  }

  const fallbackModels = [
    "gemini-flash-latest",
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite",
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-2.5-pro",
    "gemini-3.5-flash",
    "gemini-1.5-flash",
    "gemini-1.5-pro",
  ];
  const modelsToTry = [...new Set([preferred, ...fallbackModels].filter(Boolean))];
  const errors = [];
  let lastQuotaError = null;

  for (const activeModel of modelsToTry) {
    const mimeModes = [true, false];
    for (const useJsonMime of mimeModes) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
          activeModel
        )}:generateContent`;
        const generationConfig = { temperature };
        if (useJsonMime) {
          generationConfig.responseMimeType = "application/json";
        }
        const response = await axios.post(
          url,
          {
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig,
          },
          {
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": apiKey,
            },
            timeout: 60000,
          }
        );
        const resText =
          response.data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
        if (resText) return resText;
        errors.push(`${activeModel}: empty response`);
        break;
      } catch (err) {
        const status = err.response?.status;
        const apiMsg =
          err.response?.data?.error?.message || err.message || "Unknown Gemini error";
        errors.push(`${activeModel}${useJsonMime ? "" : " (no-json-mime)"}: ${apiMsg}`);

        const normalized = buildAiError("gemini", status, apiMsg);
        if (normalized.code === "AI_API_KEY_INVALID") {
          throw normalized;
        }
        if (
          normalized.code === "AI_BILLING_REQUIRED" ||
          normalized.code === "AI_RATE_LIMIT"
        ) {
          lastQuotaError = normalized;
        }

        if (useJsonMime && status === 400) {
          continue;
        }
        if (status === 404 || status === 429 || status === 400 || status === 503) {
          break;
        }
        throw normalized;
      }
    }
  }

  if (lastQuotaError) throw lastQuotaError;

  const joined = errors.join(" | ");
  if (/not found|no longer available|404/i.test(joined)) {
    throw buildAiError("gemini", 404, joined);
  }
  const fail = new Error(
    "Invalid or unavailable Gemini model. Please set a valid Model (recommended: gemini-2.0-flash) in Super Admin → OCR & API Configuration."
  );
  fail.code = "AI_MODEL_INVALID";
  throw fail;
}

async function queryClaude(prompt, credentials, temperature) {
  const { apiKey, model, baseUrl } = credentials;
  const url = `${baseUrl || "https://api.anthropic.com/v1"}/messages`;

  const response = await axios.post(
    url,
    {
      model: model || "claude-3-5-sonnet-20241022",
      max_tokens: 4000,
      messages: [{ role: "user", content: prompt }],
      temperature,
    },
    {
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
    }
  );

  return response.data?.content?.[0]?.text || "";
}

function parseAiJson(rawJsonText) {
  if (!rawJsonText || !String(rawJsonText).trim()) {
    const err = new Error("AI returned empty response");
    err.code = "AI_GENERATE_FAILED";
    throw err;
  }
  const cleanedJson = String(rawJsonText)
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
  try {
    const parsedData = JSON.parse(cleanedJson);
    if (!parsedData || typeof parsedData !== "object") {
      const err = new Error("AI returned invalid JSON structure");
      err.code = "AI_GENERATE_FAILED";
      throw err;
    }
    return parsedData;
  } catch (e) {
    if (e.code) throw e;
    const err = new Error(
      "AI returned invalid JSON. Please try Generate again, or update the AI Model in Super Admin → OCR & API Configuration."
    );
    err.code = "AI_GENERATE_FAILED";
    throw err;
  }
}

/**
 * Generate / refine a job description using the Super Admin AI provider config.
 */
async function generateJobDescription(input = {}) {
  const action = String(input.action || "generate").toLowerCase();
  if (!VALID_ACTIONS.includes(action)) {
    const err = new Error(
      `Invalid action. Allowed: ${VALID_ACTIONS.join(", ")}`
    );
    err.code = "INVALID_ACTION";
    throw err;
  }

  if (!String(input.jobTitle || "").trim()) {
    const err = new Error("Job Title is required to generate a job description.");
    err.code = "VALIDATION_ERROR";
    throw err;
  }

  const aiConfig = await getActiveAiProvider();
  if (!aiConfig) {
    const err = new Error(
      "AI API is not configured. Please ask your Super Admin to configure the AI API key and model in OCR & API Configuration."
    );
    err.code = "API_CONFIG_NOT_SET";
    throw err;
  }

  const prompt = buildPrompt({ ...input, action });
  const temperature = getTemperature(action);
  const { provider, credentials } = aiConfig;

  try {
    let rawJsonText = "";
    switch (provider) {
      case "openai":
        rawJsonText = await queryOpenAi(prompt, credentials, temperature);
        break;
      case "claude":
        rawJsonText = await queryClaude(prompt, credentials, temperature);
        break;
      case "gemini":
      default:
        rawJsonText = await queryGemini(prompt, credentials, temperature);
        break;
    }

    return normalizeJdResult(parseAiJson(rawJsonText));
  } catch (err) {
    if (err.code) throw err;
    const status = err.response?.status;
    const apiMsg =
      err.response?.data?.error?.message || err.message || "Unknown AI error";
    throw buildAiError(provider, status, apiMsg);
  }
}

module.exports = {
  VALID_ACTIONS,
  generateJobDescription,
  composeFullDescription,
};
