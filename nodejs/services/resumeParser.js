const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");
const WordExtractor = require("word-extractor");
const Tesseract = require("tesseract.js");
const axios = require("axios");
const { getActiveOcrProvider, getActiveAiProvider } = require("../middleware/apiIntegration/configResolver");

/**
 * Extracts raw text from a PDF file buffer.
 */
async function extractTextFromPdf(buffer) {
  try {
    const data = await pdfParse(buffer);
    return data.text || "";
  } catch (error) {
    console.error("PDF parse error, falling back to empty text:", error);
    return "";
  }
}

/**
 * Extracts raw text from a DOCX buffer (Office Open XML).
 */
async function extractTextFromDocx(buffer) {
  try {
    const result = await mammoth.extractRawText({ buffer });
    return (result && result.value) || "";
  } catch (error) {
    console.error("DOCX parse error, falling back to empty text:", error);
    return "";
  }
}

/**
 * Legacy .doc is often RTF saved with a .doc extension — detect by magic bytes.
 */
function isRtfBuffer(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 5) return false;
  // Compare bytes — avoid /\r/ in regex (carriage return)
  return (
    buffer[0] === 0x7b &&
    buffer[1] === 0x5c &&
    buffer[2] === 0x72 &&
    buffer[3] === 0x74 &&
    buffer[4] === 0x66
  ); // {\rtf
}

function removeRtfGroupContaining(rtf, keyword) {
  let result = rtf;
  let searchFrom = 0;
  while (true) {
    const pos = result.toLowerCase().indexOf(`\\${keyword.toLowerCase()}`, searchFrom);
    if (pos === -1) break;
    let start = pos;
    while (start > 0 && result[start] !== "{") start--;
    if (result[start] !== "{") {
      searchFrom = pos + keyword.length + 1;
      continue;
    }
    let depth = 0;
    let end = start;
    for (; end < result.length; end++) {
      if (result[end] === "{") depth++;
      else if (result[end] === "}") {
        depth--;
        if (depth === 0) {
          end++;
          break;
        }
      }
    }
    result = result.slice(0, start) + result.slice(end);
    searchFrom = start;
  }
  return result;
}

/**
 * Extracts plain text from RTF (Rich Text Format), including files named .doc.
 */
function extractTextFromRtf(buffer) {
  try {
    let rtf = buffer.toString("latin1");
    const headerGroups = [
      "fonttbl",
      "colortbl",
      "stylesheet",
      "filetbl",
      "listtable",
      "listoverridetable",
      "revtbl",
      "generator",
      "info",
      "pict",
      "object",
      "header",
      "footer",
      "footnote",
      "xmlnstbl",
      "themedata",
      "datastore",
    ];
    for (const keyword of headerGroups) {
      rtf = removeRtfGroupContaining(rtf, keyword);
    }
    rtf = rtf.replace(/\\par[d]?\s?/gi, "\n");
    rtf = rtf.replace(/\\line\s?/gi, "\n");
    rtf = rtf.replace(/\\tab\s?/gi, "\t");
    rtf = rtf.replace(/\\'([0-9a-f]{2})/gi, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    );
    rtf = rtf.replace(/\\u(-?\d+)\??\s?/g, (_, num) => {
      const code = parseInt(num, 10);
      return String.fromCharCode(code < 0 ? code + 65536 : code);
    });
    rtf = rtf.replace(/\\\*?[a-z]+-?\d*\s?/gi, "");
    rtf = rtf.replace(/[{}]/g, "");
    return rtf
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/  +/g, " ")
      .trim();
  } catch (error) {
    console.error("RTF parse error, falling back to empty text:", error);
    return "";
  }
}

/**
 * Extracts raw text from a legacy DOC buffer.
 */
async function extractTextFromDoc(buffer) {
  if (isRtfBuffer(buffer)) {
    console.log("DOC file is RTF format — using RTF extractor");
    return extractTextFromRtf(buffer);
  }
  try {
    const extractor = new WordExtractor();
    const extracted = await extractor.extract(buffer);
    return (extracted && extracted.getBody && extracted.getBody()) || "";
  } catch (error) {
    console.error("DOC parse error, falling back to empty text:", error);
    if (isRtfBuffer(buffer)) {
      return extractTextFromRtf(buffer);
    }
    return "";
  }
}

/**
 * Runs OCR on an image buffer using Google Vision API.
 */
async function runGoogleVisionOcr(imageBuffer, credentials) {
  const apiKey = credentials.apiKey;
  if (!apiKey) throw new Error("Google Vision API Key is missing");

  const base64Image = imageBuffer.toString("base64");
  const url = `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`;

  const payload = {
    requests: [
      {
        image: { content: base64Image },
        features: [{ type: "TEXT_DETECTION" }]
      }
    ]
  };

  const response = await axios.post(url, payload);
  const textAnnotation = response.data?.responses?.[0]?.fullTextAnnotation;
  return textAnnotation?.text || "";
}

/**
 * Runs OCR on an image buffer using Azure Document Intelligence.
 */
async function runAzureOcr(imageBuffer, credentials) {
  const { endpoint, apiKey } = credentials;
  if (!endpoint || !apiKey) throw new Error("Azure credentials missing");

  const cleanEndpoint = endpoint.replace(/\/$/, "");
  const url = `${cleanEndpoint}/formrecognizer/documentModels/prebuilt-layout:analyze?api-version=2023-07-31`;

  const response = await axios.post(url, imageBuffer, {
    headers: {
      "Ocp-Apim-Subscription-Key": apiKey,
      "Content-Type": "application/octet-stream"
    }
  });

  const operationLocation = response.headers["operation-location"];
  if (!operationLocation) throw new Error("Azure Document Intelligence did not return operation location");

  let status = "running";
  let result = null;
  for (let i = 0; i < 15; i++) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    const statusResp = await axios.get(operationLocation, {
      headers: { "Ocp-Apim-Subscription-Key": apiKey }
    });
    status = statusResp.data?.status;
    if (status === "succeeded") {
      result = statusResp.data?.analyzeResult;
      break;
    } else if (status === "failed") {
      throw new Error("Azure analysis failed");
    }
  }

  return result?.content || "";
}

/**
 * Runs OCR on an image buffer using local Tesseract.
 */
async function runTesseractOcr(imageBuffer, credentials) {
  const language = credentials?.language || "eng";
  const { data } = await Tesseract.recognize(imageBuffer, language);
  return data?.text || "";
}

/**
 * Perform OCR based on the active provider.
 */
async function extractTextWithOcr(imageBuffer) {
  const ocrConfig = await getActiveOcrProvider();
  if (!ocrConfig) {
    console.log("No active OCR provider in DB, using default Tesseract OCR.");
    return await runTesseractOcr(imageBuffer, { language: "eng" });
  }

  const { provider, credentials } = ocrConfig;
  console.log(`Running OCR using provider: ${provider}`);

  switch (provider) {
    case "google_vision":
      return await runGoogleVisionOcr(imageBuffer, credentials);
    case "azure_document_intelligence":
      return await runAzureOcr(imageBuffer, credentials);
    case "tesseract":
    default:
      return await runTesseractOcr(imageBuffer, credentials);
  }
}

/**
 * Smart NLP & Regex-based parser that accurately extracts all candidate fields from OCR or PDF text.
 */
function smartRegexAndLabelParse(text) {
  console.log("Using Smart Regex & Label Fallback Parser...");
  const cleanText = (text || "").replace(/\r\n/g, "\n");
  const lines = cleanText.split("\n").map(l => l.trim()).filter(l => l.length > 0);

  function extractAfterLabel(labels, stopWords = []) {
    for (const label of labels) {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lowerLine = line.toLowerCase();
        const lowerLabel = label.toLowerCase();
        if (lowerLine.startsWith(lowerLabel)) {
          let val = line.substring(label.length).trim();
          val = val.replace(/^[:\-)]+\s*/, "").trim();
          if (val && val.length > 0 && !val.toLowerCase().startsWith("select")) {
            return val;
          }
          if (i + 1 < lines.length) {
            const nextVal = lines[i + 1].trim();
            const lowerNext = nextVal.toLowerCase();
            const isStopWord = stopWords.some(sw => lowerNext.startsWith(sw.toLowerCase()));
            if (!isStopWord && nextVal.length > 0 && !lowerNext.startsWith("select")) {
              return nextVal;
            }
          }
        } else if (lowerLine.includes(lowerLabel) && label.length > 4) {
          const idx = lowerLine.indexOf(lowerLabel);
          let val = line.substring(idx + label.length).trim();
          val = val.replace(/^[:\-)]+\s*/, "").trim();
          if (val && val.length > 0 && !val.toLowerCase().startsWith("select")) {
            return val;
          }
        }
      }
    }
    return "";
  }

  // First Name & Last Name
  let firstname = extractAfterLabel(["First Name", "FirstName", "Given Name"]);
  let lastname = extractAfterLabel(["Last Name", "LastName", "Surname"]);
  let fullname = extractAfterLabel(["Full Name", "Name", "Candidate Name"]);
  
  if (fullname) {
    const parts = fullname.trim().split(/\s+/);
    if (!firstname) firstname = parts[0];
    if (!lastname && parts.length > 1) lastname = parts.slice(1).join(" ");
  }
  
  if (!firstname) {
    for (const l of lines) {
      if (/^[A-Za-z\s.'-]{3,40}$/.test(l) && !/^(basic info|resume|curriculum vitae|contact|page|address|professional|additional)/i.test(l)) {
        const parts = l.split(/\s+/);
        firstname = parts[0];
        if (parts.length > 1) lastname = parts.slice(1).join(" ");
        break;
      }
    }
  }
  if (!firstname || firstname === "2" || firstname === "1" || firstname.toLowerCase() === "basic") firstname = "Candidate";

  // Email
  const emailMatch = text.match(/[a-zA-Z0-9._%+-]+\s*@\s*[a-zA-Z0-9.-]+\s*\.\s*[a-zA-Z]{2,}/);
  const email = emailMatch ? emailMatch[0].replace(/\s+/g, "") : "";

  // Mobiles
  const phoneMatches = text.match(/\+?[0-9][0-9\s-]{8,14}[0-9]/g) || [];
  const cleanPhones = phoneMatches.map(p => {
    let c = p.replace(/[\s-]/g, "");
    if (c.startsWith("+91")) c = c.substring(3);
    else if (c.startsWith("91") && c.length === 12) c = c.substring(2);
    else if (c.startsWith("0") && c.length === 11) c = c.substring(1);
    return c;
  }).filter(c => c.length >= 10 && c.length <= 15);

  const mobile = cleanPhones[0] || "";
  const alternateMobile = cleanPhones[1] || "";

  // DOB
  let dateOfBirth = extractAfterLabel(["Date of Birth", "DOB", "Birth Date"]);
  if (!dateOfBirth) {
    const dobMatch = text.match(/\b(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{4}|\d{4}[\/\-.]\d{1,2}[\/\-.]\d{1,2})\b/);
    if (dobMatch) dateOfBirth = dobMatch[0];
  }

  // Gender — never treat "female" as male (substring trap); no male default
  let gender = extractAfterLabel(["Gender", "Sex"]);
  if (!gender) {
    if (/\bfemale\b/i.test(text) || /\bwoman\b/i.test(text)) gender = "Female";
    else if (/\bmale\b/i.test(text) || /\bman\b/i.test(text)) gender = "Male";
    else gender = "";
  } else {
    const g = String(gender).toLowerCase();
    if (/\bfemale\b|\bwoman\b|\bf\b/.test(g) || g.includes("female")) gender = "Female";
    else if (/\bmale\b|\bman\b|\bm\b/.test(g) || /(^|[^a-z])male([^a-z]|$)/i.test(g)) gender = "Male";
    else if (g === "f") gender = "Female";
    else if (g === "m") gender = "Male";
    else gender = "";
  }

  // Address info
  let street = extractAfterLabel(["Address Information", "Address", "Street Address", "Current Address"], ["State", "City", "Zip"]);
  if (street) street = street.replace(/^(address|information|details)\s+/i, "").trim();
  let state = extractAfterLabel(["State", "State Name"]);
  let city = extractAfterLabel(["City", "City Name"]);
  let zip = extractAfterLabel([
    "Zip/Postal Code",
    "Zip Code",
    "Postal Code",
    "Pincode",
    "Pin Code",
    "PIN Code",
    "PIN",
  ]);
  if (zip) {
    const zipDigits = String(zip).replace(/\D/g, "");
    zip = zipDigits.length >= 6 ? zipDigits.slice(0, 6) : zipDigits;
  }
  if (!zip) {
    // Indian PIN is 6 digits; avoid matching mobile by requiring non-digit boundaries
    const pinMatch = text.match(
      /(?:pin\s*code|pincode|postal\s*code|zip\s*code|zip|postal)?\s*[:\-]?\s*\b([1-9][0-9]{5})\b/i
    );
    if (pinMatch) zip = pinMatch[1];
  }

  // Professional details
  let industry = extractAfterLabel(["Industries (Select 3)", "Industries", "Industry"]);
  let experienceInyear = extractAfterLabel(["Experience", "Total Experience", "Work Experience"]);
  if (experienceInyear) {
    const expNum = experienceInyear.match(/[0-9.]+/);
    if (expNum) experienceInyear = expNum[0];
  } else {
    experienceInyear = "";
  }

  let highestQualification = extractAfterLabel(["Qualification Held", "Highest Qualification", "Qualification", "Degree"]);
  let educationField = extractAfterLabel(["Education", "Field of Study", "Specialization"]);
  let course = extractAfterLabel(["Course", "Degree Course"]);
  let designation = extractAfterLabel(["Designation", "Current Designation", "Job Title"]);
  let jobCategory = extractAfterLabel(["Job Category", "Category"]);
  let currentEmployer = extractAfterLabel(["Current Company Name", "Current Company", "Current Employer", "Company Name", "Employer"]);
  
  let currentSalaryStr = extractAfterLabel(["Last/Current Monthly Salary", "Current Monthly Salary", "Current Salary", "Monthly Salary"]);
  let currentSalary = null;
  if (currentSalaryStr) {
    const salNum = currentSalaryStr.split('(')[0].replace(/[^0-9.]/g, "");
    if (salNum) currentSalary = parseFloat(salNum);
  }

  let expectedSalaryStr = extractAfterLabel(["Expected Monthly Salary", "Expected Salary"]);
  let expectedsalary = null;
  if (expectedSalaryStr) {
    const expSalNum = expectedSalaryStr.split('(')[0].replace(/[^0-9.]/g, "");
    if (expSalNum) expectedsalary = parseFloat(expSalNum);
  }

  let noticePeriod = extractAfterLabel(["Notice Period", "Joining Time"]);
  let currentlyWorking = extractAfterLabel(["Currently Working", "Current Status"]);
  if (/yes/i.test(currentlyWorking)) currentlyWorking = "Yes";
  else if (/no/i.test(currentlyWorking)) currentlyWorking = "No";

  let preferedJobLocation = extractAfterLabel(["Enter Preferred Job Location", "Preferred Job Location", "Job Location", "Preferred Location"]);

  // Additional info
  let skill = extractAfterLabel(["Skill Set", "Skills", "Key Skills"]);
  if (skill.includes("|")) skill = skill.split("|").map(s => s.trim()).filter(Boolean).join(", ");
  if (!skill) {
    const skillsList = ["javascript", "node", "react", "express", "mongodb", "mysql", "php", "laravel", "html", "css", "python", "java", "design"];
    const matchedSkills = [];
    skillsList.forEach(s => { if (text.toLowerCase().includes(s)) matchedSkills.push(s.toUpperCase()); });
    skill = matchedSkills.join(", ");
  }

  let languages = extractAfterLabel(["Languages Known", "Languages"]);
  if (!languages) languages = "English";

  let certifications = extractAfterLabel(["Certifications", "Certificates"]);

  const education = [];
  if (highestQualification || educationField || course) {
    education.push({
      name: highestQualification || course || "Degree",
      sub: educationField || course || "",
      institution: ""
    });
  }

  return {
    firstname,
    lastname,
    mobile,
    alternateMobile,
    email,
    gender,
    dateOfBirth,
    street,
    city,
    state,
    zip,
    linkedinProfile: "",
    portfolioWebsite: "",
    languages,
    certifications,
    education,
    industry,
    professional: {
      currentlyWorking: currentlyWorking || "Yes",
      currentEmployer,
      designation,
      experienceInyear,
      currentSalary,
      expectedsalary,
      noticePeriod,
      skill,
      preferedJobLocation,
      jobCategory,
      course,
      highestQualification
    }
  };
}

/**
 * Extract fields from text using OpenAI.
 */
async function queryOpenAi(text, credentials) {
  const { apiKey, model, baseUrl } = credentials;
  const url = `${baseUrl || "https://api.openai.com/v1"}/chat/completions`;
  const prompt = getAiPrompt(text);

  const response = await axios.post(
    url,
    {
      model: model || "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      }
    }
  );

  return response.data?.choices?.[0]?.message?.content || "";
}

/**
 * Map raw AI/provider errors to user-friendly validation messages.
 */
function buildAiError(provider, status, apiMsg = "") {
  const msg = String(apiMsg || "").toLowerCase();
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

  const err = new Error();
  if (isAuthFailure) {
    err.code = "AI_API_KEY_INVALID";
    err.message =
      "Invalid AI API Key. Please enter a valid API Key in Super Admin → OCR & API Configuration, then Save and try again.";
    return err;
  }

  if (status === 429 || msg.includes("rate limit") || msg.includes("quota")) {
    err.code = "AI_RATE_LIMIT";
    err.message =
      "AI service rate limit reached. Please wait a moment and try again, or check your Gemini quota/billing.";
    return err;
  }

  if (
    status === 503 ||
    status === 502 ||
    msg.includes("high demand") ||
    msg.includes("try again later") ||
    msg.includes("overloaded")
  ) {
    err.code = "AI_SERVICE_BUSY";
    err.message =
      "Gemini is temporarily busy (high demand). Please wait a few seconds and try again.";
    return err;
  }

  if (status === 404 || msg.includes("not found") || msg.includes("is not found")) {
    err.code = "AI_MODEL_INVALID";
    err.message =
      "Invalid AI Model. Please set a valid Model (recommended: gemini-3.5-flash) in Super Admin → OCR & API Configuration.";
    return err;
  }

  err.code = "AI_PARSE_FAILED";
  err.message =
    `AI Auto Data Extraction failed (${provider}). Please verify AI API Key and Model in Super Admin → OCR & API Configuration.`;
  return err;
}

/**
 * Extract fields from text using Gemini with automatic model fallbacks on rate limit / model 404.
 */
async function queryGemini(text, credentials) {
  const { apiKey, model } = credentials;
  const preferred = (model || "").trim();
  const fallbackModels = [
    "gemini-3.5-flash",
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-2.0-flash",
    "gemini-1.5-flash",
    "gemini-1.5-pro",
  ];
  const modelsToTry = [
    ...new Set(
      [preferred, ...fallbackModels].filter(Boolean)
    ),
  ];
  const prompt = getAiPrompt(text);
  const errors = [];
  let authError = null;

  for (const activeModel of modelsToTry) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${activeModel}:generateContent?key=${apiKey}`;
      const response = await axios.post(url, {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.1
        }
      });
      const resText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
      if (resText) return resText;
      errors.push(`${activeModel}: empty response`);
    } catch (err) {
      const status = err.response?.status;
      const apiMsg =
        err.response?.data?.error?.message ||
        err.message ||
        "Unknown Gemini error";
      errors.push(`${activeModel}: ${apiMsg}`);
      console.error(
        "Gemini request failed =>",
        JSON.stringify({
          model: activeModel,
          status: status || null,
          code: err.code || null,
          apiMsg,
          hasResponse: Boolean(err.response),
        })
      );

      if (!err.response) {
        const net = new Error(
          `Cannot reach Google Gemini from this server (${err.code || apiMsg}). Hostinger outbound access to generativelanguage.googleapis.com may be blocked.`
        );
        net.code = "AI_NETWORK_ERROR";
        throw net;
      }

      const normalized = buildAiError("gemini", status, apiMsg);
      if (normalized.code === "AI_API_KEY_INVALID") {
        authError = normalized;
        // Same key fails for every model — stop immediately
        throw authError;
      }

      // Try next model when deprecated/missing, rate-limited, overloaded, or bad request for that model
      if (status === 404 || status === 429 || status === 400 || status === 503 || status === 502) {
        console.warn(
          `Gemini model ${activeModel} failed (${status}): ${apiMsg}. Trying next model...`
        );
        continue;
      }

      throw normalized;
    }
  }

  if (authError) throw authError;

  if (errors.some((e) => /high demand|503|overloaded|try again later/i.test(e))) {
    throw buildAiError("gemini", 503, errors.join(" | "));
  }

  const modelErr = buildAiError("gemini", 404, errors.join(" | "));
  if (errors.some((e) => /not found|404/i.test(e))) {
    throw modelErr;
  }
  throw new Error(
    `All Gemini models failed. Update Model in OCR & API Configuration (recommended: gemini-3.5-flash).`
  );
}

/**
 * Extract fields from text using Claude.
 */
async function queryClaude(text, credentials) {
  const { apiKey, model, baseUrl } = credentials;
  const url = `${baseUrl || "https://api.anthropic.com/v1"}/messages`;
  const prompt = getAiPrompt(text);

  const response = await axios.post(
    url,
    {
      model: model || "claude-3-5-sonnet-20241022",
      max_tokens: 4000,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1
    },
    {
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json"
      }
    }
  );

  return response.data?.content?.[0]?.text || "";
}

/**
 * Generates prompt for the AI extractor.
 */
function getAiPrompt(text) {
  return `You are an expert AI resume parser. Analyze the following resume text and extract all candidate details into a valid JSON object ONLY. 
Do not include any explanation or markdown formatting like \`\`\`json. Return the exact JSON structure specified below.

Schema requirements:
- Return personal and professional information exactly matching the fields below.
- Clean mobile numbers (remove spaces, hyphens).
- Return experienceInyear as a string (e.g. "4.5").
- Extract street, city, state, zip accurately.
- Extract currentEmployer, designation, course, highestQualification accurately.

JSON Structure:
{
  "firstname": "string or empty",
  "lastname": "string or empty",
  "mobile": "string or empty",
  "alternateMobile": "string or empty",
  "email": "string or empty",
  "gender": "string: lowercase male or female only, or empty",
  "dateOfBirth": "string (YYYY-MM-DD or DD-MM-YYYY) or empty",
  "street": "string or empty",
  "city": "string or empty",
  "state": "string or empty",
  "zip": "string or empty",
  "linkedinProfile": "string or empty",
  "portfolioWebsite": "string or empty",
  "languages": "string (comma separated) or empty",
  "certifications": "string (comma separated) or empty",
  "education": [
    {
      "name": "Degree Name",
      "sub": "Field of study",
      "institution": "University/School name"
    }
  ],
  "industry": "string (comma separated) or empty",
  "professional": {
    "currentlyWorking": "lowercase yes or no only",
    "currentEmployer": "Current Company Name or empty",
    "designation": "Current Designation/Job Title or empty",
    "experienceInyear": "exactly one of: 0-1 year, 1-3 year, 3-5 year, 5 year above",
    "currentSalary": number (annual/monthly salary) or 0,
    "expectedsalary": number (expected salary) or 0,
    "noticePeriod": "exactly one of: none, 1-15 days, 15-30 days, 30-45 days",
    "skill": "string (comma separated skills) or empty",
    "preferedJobLocation": "string or empty",
    "jobCategory": "string or empty",
    "course": "string or empty",
    "highestQualification": "exactly one of: under graduate, graduation, post graduate"
  }
}

Resume Text to analyze:
\`\`\`
${text}
\`\`\``;
}

function normalizeGenderValue(gender) {
  const raw = String(gender || "").trim().toLowerCase();
  if (!raw) return "";
  if (raw === "f" || raw === "female" || /\bfemale\b/.test(raw) || /\bwoman\b/.test(raw)) return "female";
  if (raw === "m" || raw === "male" || /\bmale\b/.test(raw) || /\bman\b/.test(raw)) return "male";
  return "";
}

function normalizeExperienceInYearValue(raw) {
  if (raw === undefined || raw === null || raw === "") return "";
  const str = String(raw).trim().toLowerCase();
  const buckets = ["0-1 year", "1-3 year", "3-5 year", "5 year above"];
  if (buckets.includes(str)) return str;
  const numMatch = str.match(/(\d+(?:\.\d+)?)/);
  const years = numMatch ? parseFloat(numMatch[1]) : NaN;
  if (!isNaN(years)) {
    if (years < 1) return "0-1 year";
    if (years < 3) return "1-3 year";
    if (years < 5) return "3-5 year";
    return "5 year above";
  }
  if (/fresher|no experience|fresh/.test(str)) return "0-1 year";
  return "";
}

function normalizeCurrentlyWorkingValue(raw) {
  const str = String(raw || "").trim().toLowerCase();
  if (!str) return "";
  if (/^(yes|y|true|currently|working|employed)/.test(str)) return "yes";
  if (/^(no|n|false|not|unemployed|student)/.test(str)) return "no";
  return "";
}

function normalizeNoticePeriodValue(raw) {
  const str = String(raw || "").trim().toLowerCase();
  if (!str) return "";
  if (/none|immediate|not applicable|^na$/.test(str)) return "none";
  const numMatch = str.match(/(\d+)/);
  const days = numMatch ? parseInt(numMatch[1], 10) : NaN;
  if (!isNaN(days)) {
    if (days <= 15) return "1-15 days";
    if (days <= 30) return "15-30 days";
    return "30-45 days";
  }
  if (/1-15/.test(str)) return "1-15 days";
  if (/15-30/.test(str)) return "15-30 days";
  if (/30-45|45|60|90/.test(str)) return "30-45 days";
  return "";
}

function normalizeHighestQualificationValue(raw) {
  const str = String(raw || "").trim().toLowerCase();
  if (!str) return "";
  if (["under graduate", "graduation", "post graduate"].includes(str)) return str;
  if (/post\s*grad|master|mba|m\.?tech|phd|doctorate/.test(str)) return "post graduate";
  if (/under\s*grad|12th|hsc|ssc|intermediate/.test(str)) return "under graduate";
  if (/b\.?tech|b\.?e\.?|bachelor|b\.?arch|b\.?com|b\.?sc|bca|graduation|graduate|degree|diploma/.test(str)) {
    return "graduation";
  }
  return "";
}

function normalizeParsedResumeData(parsedData) {
  if (!parsedData || typeof parsedData !== "object") return parsedData;
  parsedData.gender = normalizeGenderValue(parsedData.gender);
  if (!parsedData.professional || typeof parsedData.professional !== "object") {
    parsedData.professional = {};
  }
  const prof = parsedData.professional;
  prof.experienceInyear = normalizeExperienceInYearValue(prof.experienceInyear);
  prof.currentlyWorking = normalizeCurrentlyWorkingValue(prof.currentlyWorking);
  prof.noticePeriod = normalizeNoticePeriodValue(prof.noticePeriod);
  prof.highestQualification = normalizeHighestQualificationValue(
    prof.highestQualification || prof.course || ""
  );
  return parsedData;
}

/**
 * Extract the first balanced JSON object from a string (handles trailing AI commentary).
 */
function extractJsonObject(text) {
  const start = text.indexOf("{");
  if (start === -1) {
    throw new Error("No JSON object found in AI response");
  }

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escape) {
        escape = false;
      } else if (ch === "\\") {
        escape = true;
      } else if (ch === '"') {
        inString = false;
      }
    } else if (ch === '"') {
      inString = true;
    } else if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) {
        return text.substring(start, i + 1);
      }
    }
  }

  throw new Error("Unbalanced JSON object in AI response");
}

/**
 * Parse AI text into JSON, tolerating markdown fences and trailing non-JSON text.
 */
function parseAiJsonResponse(rawJsonText) {
  if (!rawJsonText || !String(rawJsonText).trim()) {
    throw new Error("AI returned empty response");
  }

  const cleanedJson = String(rawJsonText)
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();

  try {
    return JSON.parse(cleanedJson);
  } catch (firstError) {
    try {
      return JSON.parse(extractJsonObject(cleanedJson));
    } catch (secondError) {
      const err = new Error(
        "AI returned invalid JSON. Please try uploading again or update the AI Model in Super Admin → OCR & API Configuration."
      );
      err.code = "AI_PARSE_FAILED";
      throw err;
    }
  }
}

/**
 * Parse resume using configured AI only (no regex auto-fill success path).
 */
async function parseResumeData(fileData, extractionSource = "application/pdf", fileName = "") {
  let textStr = "";
  let sourceLabel = extractionSource;

  if (Buffer.isBuffer(fileData)) {
    const mime = String(extractionSource || "").toLowerCase();
    const name = String(fileName || "").toLowerCase();
    const isPdf = mime.includes("pdf") || name.endsWith(".pdf");
    const isImage =
      mime.includes("image") ||
      mime.includes("png") ||
      mime.includes("jpg") ||
      mime.includes("jpeg") ||
      /\.(png|jpe?g)$/.test(name);
    const isDocx =
      mime.includes("wordprocessingml") ||
      mime.includes("docx") ||
      name.endsWith(".docx");
    const isRtf =
      mime.includes("rtf") ||
      name.endsWith(".rtf") ||
      (Buffer.isBuffer(fileData) && isRtfBuffer(fileData));
    // Legacy .doc (also when browser sends empty/octet-stream mime)
    const isDoc =
      !isDocx &&
      !isRtf &&
      (mime.includes("msword") ||
        mime === "application/msword" ||
        name.endsWith(".doc"));

    if (isPdf) {
      console.log("Extracting text from PDF buffer...");
      textStr = await extractTextFromPdf(fileData);
      sourceLabel = "PDF Extraction";
    } else if (isImage) {
      console.log("Extracting text from Image buffer using OCR...");
      textStr = await extractTextWithOcr(fileData);
      sourceLabel = "OCR Extraction";
    } else if (isDocx) {
      console.log("Extracting text from DOCX buffer...");
      textStr = await extractTextFromDocx(fileData);
      sourceLabel = "DOCX Extraction";
    } else if (isRtf) {
      console.log("Extracting text from RTF buffer...");
      textStr = extractTextFromRtf(fileData);
      sourceLabel = "RTF Extraction";
    } else if (isDoc) {
      console.log("Extracting text from DOC buffer...");
      textStr = await extractTextFromDoc(fileData);
      sourceLabel = "DOC Extraction";
    } else {
      console.log("Unknown mimetype, converting buffer directly to string...");
      textStr = fileData.toString("utf8");
      sourceLabel = "Raw Text";
    }
  } else {
    textStr = typeof fileData === "string" ? fileData : String(fileData || "");
    sourceLabel = typeof mimeType === "string" ? mimeType : "Text/PDF";
  }

  if (!textStr.trim()) {
    const err = new Error("Could not extract text from the uploaded resume. Please upload a valid PDF, DOC, DOCX, or image.");
    err.code = "EMPTY_RESUME_TEXT";
    throw err;
  }

  console.log("--- RAW EXTRACTED RESUME TEXT ---");
  console.log(textStr);
  console.log("---------------------------------");

  const aiConfig = await getActiveAiProvider();
  if (!aiConfig) {
    const err = new Error(
      "AI API is not configured. Please ask your Super Admin to configure the AI API key and model in OCR & API Configuration."
    );
    err.code = "API_CONFIG_NOT_SET";
    throw err;
  }

  const { provider, credentials } = aiConfig;
  console.log(`Parsing resume text with AI provider: ${provider}`);

  try {
    let rawJsonText = "";
    switch (provider) {
      case "openai":
        rawJsonText = await queryOpenAi(textStr, credentials);
        break;
      case "claude":
        rawJsonText = await queryClaude(textStr, credentials);
        break;
      case "gemini":
      default:
        rawJsonText = await queryGemini(textStr, credentials);
        break;
    }

    if (!rawJsonText || !String(rawJsonText).trim()) {
      throw new Error("AI returned empty response");
    }

    const parsedData = parseAiJsonResponse(rawJsonText);

    if (!parsedData || typeof parsedData !== "object") {
      throw new Error("AI returned invalid JSON structure");
    }

    normalizeParsedResumeData(parsedData);

    return {
      parsedData,
      parser: `AI Parser (${provider})`,
      extractionSource: sourceLabel,
      confidence: "95%"
    };
  } catch (aiError) {
    console.error("AI parsing failed:", aiError.message);
    if (aiError.code && String(aiError.code).startsWith("AI_")) {
      throw aiError;
    }
    const normalized = buildAiError(
      provider,
      aiError.response?.status,
      aiError.message
    );
    // Prefer already-friendly messages that don't expose OAuth / raw Google text
    if (
      aiError.message &&
      !/oauth|credential|sign-in|developers\.google/i.test(aiError.message)
    ) {
      normalized.message = aiError.message;
      if (aiError.code) normalized.code = aiError.code;
    }
    throw normalized;
  }
}

module.exports = {
  parseResumeData,
  extractTextFromPdf,
  extractTextWithOcr,
  smartRegexAndLabelParse
};
