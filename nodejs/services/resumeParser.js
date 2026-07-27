const pdfParse = require("pdf-parse");
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

      const normalized = buildAiError("gemini", status, apiMsg);
      if (normalized.code === "AI_API_KEY_INVALID") {
        authError = normalized;
        // Same key fails for every model — stop immediately
        throw authError;
      }

      // Try next model when deprecated/missing (404) or rate-limited (429) or bad request for that model
      if (status === 404 || status === 429 || status === 400) {
        console.warn(
          `Gemini model ${activeModel} failed (${status}): ${apiMsg}. Trying next model...`
        );
        continue;
      }

      throw normalized;
    }
  }

  if (authError) throw authError;

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
  "gender": "string or empty (Male, Female, Other)",
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
    "currentlyWorking": "Yes or No",
    "currentEmployer": "Current Company Name or empty",
    "designation": "Current Designation/Job Title or empty",
    "experienceInyear": "string of total years (e.g. 4.5) or empty",
    "currentSalary": number (annual/monthly salary) or 0,
    "expectedsalary": number (expected salary) or 0,
    "noticePeriod": "string (e.g. 30 Days) or empty",
    "skill": "string (comma separated skills) or empty",
    "preferedJobLocation": "string or empty",
    "jobCategory": "string or empty",
    "course": "string or empty",
    "highestQualification": "string or empty"
  }
}

Resume Text to analyze:
\`\`\`
${text}
\`\`\``;
}

/**
 * Parse resume using configured AI only (no regex auto-fill success path).
 */
async function parseResumeData(fileData, extractionSource = "application/pdf") {
  let textStr = "";
  let sourceLabel = extractionSource;

  if (Buffer.isBuffer(fileData)) {
    const isPdf = extractionSource && extractionSource.toLowerCase().includes("pdf");
    const isImage = extractionSource && (extractionSource.toLowerCase().includes("image") || extractionSource.toLowerCase().includes("png") || extractionSource.toLowerCase().includes("jpg") || extractionSource.toLowerCase().includes("jpeg"));
    
    if (isPdf) {
      console.log("Extracting text from PDF buffer...");
      textStr = await extractTextFromPdf(fileData);
      sourceLabel = "PDF Extraction";
    } else if (isImage) {
      console.log("Extracting text from Image buffer using OCR...");
      textStr = await extractTextWithOcr(fileData);
      sourceLabel = "OCR Extraction";
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
    const err = new Error("Could not extract text from the uploaded resume. Please upload a valid PDF or image.");
    err.code = "EMPTY_RESUME_TEXT";
    throw err;
  }

  console.log("--- RAW EXTRACTED RESUME TEXT ---");
  console.log(textStr);
  console.log("---------------------------------");

  const aiConfig = await getActiveAiProvider();
  if (!aiConfig) {
    const err = new Error(
      "AI API is not configured. Please ask the Super Admin to configure the AI API Key and Model in OCR & API Configuration."
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

    const cleanedJson = rawJsonText.replace(/\`\`\`json/g, "").replace(/\`\`\`/g, "").trim();
    const parsedData = JSON.parse(cleanedJson);

    if (!parsedData || typeof parsedData !== "object") {
      throw new Error("AI returned invalid JSON structure");
    }

    if (!parsedData.professional || typeof parsedData.professional !== "object") {
      parsedData.professional = parsedData.professional || {};
    }

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
