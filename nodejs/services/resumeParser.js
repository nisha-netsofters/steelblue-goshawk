const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");
const WordExtractor = require("word-extractor");
const Tesseract = require("tesseract.js");
const axios = require("axios");
const zlib = require("zlib");
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

/** CRC32 for minimal PNG encoder (no extra packages). */
const PNG_CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function pngCrc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = PNG_CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(pngCrc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function rgbToPng(width, height, rgb) {
  const rows = [];
  const row = Buffer.alloc(1 + width * 3);
  for (let y = 0; y < height; y++) {
    row[0] = 0;
    rgb.copy(row, 1, y * width * 3, (y + 1) * width * 3);
    rows.push(Buffer.from(row));
  }
  const compressed = zlib.deflateSync(Buffer.concat(rows), { level: 6 });
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", compressed),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function downsampleRgb(rgb, width, height, factor) {
  const nw = Math.max(1, Math.floor(width / factor));
  const nh = Math.max(1, Math.floor(height / factor));
  const out = Buffer.alloc(nw * nh * 3);
  for (let y = 0; y < nh; y++) {
    for (let x = 0; x < nw; x++) {
      const si = (y * factor * width + x * factor) * 3;
      const di = (y * nw + x) * 3;
      out[di] = rgb[si];
      out[di + 1] = rgb[si + 1];
      out[di + 2] = rgb[si + 2];
    }
  }
  return { rgb: out, width: nw, height: nh };
}

/**
 * Pull largest raster image out of a scanned PDF (no new npm packages).
 * Supports /Filter /FlateDecode + DeviceRGB and /DCTDecode (JPEG).
 */
function extractLargestImageFromPdf(pdfBuf) {
  if (!Buffer.isBuffer(pdfBuf) || pdfBuf.length < 100) return null;
  const latin = pdfBuf.toString("latin1");
  const re = /<<[\s\S]*?\/Subtype\s*\/Image[\s\S]*?>>\s*stream\r?\n/g;
  let best = null;
  let m;
  while ((m = re.exec(latin))) {
    const dict = m[0];
    const width = Number((dict.match(/\/Width\s+(\d+)/) || [])[1]);
    const height = Number((dict.match(/\/Height\s+(\d+)/) || [])[1]);
    if (!width || !height) continue;
    const filterMatch = dict.match(/\/Filter\s*\/(\w+)/);
    const filter = String(filterMatch?.[1] || "").toLowerCase();
    const colorSpace = String(
      (dict.match(/\/ColorSpace\s*\/(\w+)/) || [])[1] || ""
    ).toLowerCase();
    const streamStart = m.index + m[0].length;
    const endIdx = latin.indexOf("endstream", streamStart);
    if (endIdx < 0) continue;
    let raw = pdfBuf.slice(streamStart, endIdx);
    while (
      raw.length &&
      (raw[raw.length - 1] === 0x0a || raw[raw.length - 1] === 0x0d)
    ) {
      raw = raw.slice(0, -1);
    }
    const area = width * height;
    if (!best || area > best.area) {
      best = { width, height, filter, colorSpace, raw, area };
    }
  }
  if (!best) return null;

  try {
    if (best.filter === "dctdecode") {
      return best.raw; // already JPEG
    }
    if (best.filter === "flatedecode" && best.colorSpace === "devicergb") {
      const rgb = zlib.inflateSync(best.raw);
      const expected = best.width * best.height * 3;
      if (rgb.length < expected) return null;
      // Downsample large pages so OCR stays reliable/fast
      const maxEdge = Math.max(best.width, best.height);
      const factor = maxEdge > 2200 ? 2 : 1;
      const ds =
        factor > 1
          ? downsampleRgb(rgb, best.width, best.height, factor)
          : { rgb, width: best.width, height: best.height };
      return rgbToPng(ds.width, ds.height, ds.rgb);
    }
  } catch (e) {
    console.warn("PDF image extract failed:", e?.message || e);
  }
  return null;
}

/**
 * When PDF has no text layer (scan), OCR the embedded page image.
 * @returns {{ text: string, usedOcr: boolean }}
 */
async function extractTextFromPdfWithOcrFallback(pdfBuffer) {
  const text = await extractTextFromPdf(pdfBuffer);
  if (String(text || "").trim().length >= 40) {
    return { text, usedOcr: false };
  }

  console.log(
    "PDF text layer empty/short — trying OCR on embedded page image..."
  );
  const imageBuf = extractLargestImageFromPdf(pdfBuffer);
  if (!imageBuf) {
    console.warn("No extractable image found inside PDF for OCR.");
    return { text: text || "", usedOcr: false };
  }
  const ocrText = await extractTextWithOcr(imageBuf);
  if (String(ocrText || "").trim()) {
    console.log("PDF OCR fallback extracted characters:", ocrText.length);
    return { text: ocrText, usedOcr: true };
  }
  return { text: text || "", usedOcr: false };
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
 * Falls back to built-in Tesseract when a cloud OCR key is invalid or unreachable.
 */
async function extractTextWithOcr(imageBuffer) {
  const ocrConfig = await getActiveOcrProvider();
  if (!ocrConfig) {
    console.log("No active OCR provider in DB, using default Tesseract OCR.");
    return await runTesseractOcr(imageBuffer, { language: "eng" });
  }

  const { provider, credentials } = ocrConfig;
  console.log(`Running OCR using provider: ${provider}`);

  const fallbackToTesseract = async (reason) => {
    console.warn(`${provider} OCR failed (${reason}) — falling back to Tesseract.`);
    return runTesseractOcr(imageBuffer, { language: "eng" });
  };

  try {
    switch (provider) {
      case "google_vision":
        return await runGoogleVisionOcr(imageBuffer, credentials);
      case "azure_document_intelligence":
        return await runAzureOcr(imageBuffer, credentials);
      case "tesseract":
      default:
        return await runTesseractOcr(imageBuffer, credentials);
    }
  } catch (err) {
    const status = err.response?.status;
    const isAuthFailure = status === 401 || status === 403;
    const isUnreachable = !err.response && Boolean(err.code);

    if (provider === "google_vision" || provider === "azure_document_intelligence") {
      if (isAuthFailure || isUnreachable) {
        const text = await fallbackToTesseract(status || err.code || err.message);
        if (text && text.trim()) return text;
      }
    }

    if (isAuthFailure) {
      const authErr = new Error(
        "Invalid OCR API key for image resume upload. Update Google Vision in Super Admin → OCR & API Configuration, or switch to Tesseract OCR."
      );
      authErr.code = "OCR_API_KEY_INVALID";
      throw authErr;
    }

    throw err;
  }
}

/**
 * First role title under Experience / Work Experience (when no Job Category label).
 */
function extractFirstExperienceTitle(text) {
  const raw = String(text || "").replace(/\r\n/g, "\n");
  const match = raw.match(
    /(?:^|\n)\s*(?:work\s+)?experience\s*(?:\n|:)([\s\S]{0,800})/i
  );
  if (!match) return "";
  const block = match[1] || "";
  const lines = block
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const skip =
    /^(education|skills?|certificate|certifications?|projects?|about|summary|objective|contact|personal|languages?|hobbies|interest)/i;
  const dateOnly =
    /^(\d{4}|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i;
  for (const line of lines) {
    if (skip.test(line)) break;
    if (dateOnly.test(line)) continue;
    if (/^\d{4}\s*[-–—to]+\s*(\d{4}|present|current)/i.test(line)) continue;
    if (line.length < 2 || line.length > 60) continue;
    if (/@|www\.|http|\d{10}/i.test(line)) continue;
    // Prefer title-like short lines (not long sentences)
    if (line.split(/\s+/).length <= 6 && !/[.!?]$/.test(line)) {
      return line.replace(/[,|•·\-–—]+$/g, "").trim();
    }
  }
  return "";
}

/**
 * Job-title-like tokens from resume filename (e.g. Akshita_..._Receptionist_Varacha.pdf).
 */
function extractJobCategoryFromFileName(fileName) {
  const base = String(fileName || "")
    .replace(/^.*[\\/]/, "")
    .replace(/\.[a-z0-9]+$/i, "");
  if (!base) return "";
  const parts = base
    .split(/[_\-\s.]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const skip = new Set([
    "cv",
    "resume",
    "updated",
    "final",
    "copy",
    "new",
    "doc",
    "pdf",
  ]);
  const cityish =
    /^(surat|ahmedabad|varacha|varachha|vesu|adajan|mumbai|delhi|pune|bangalore|chennai|hyderabad|india)$/i;
  for (const part of parts) {
    if (/^\d+$/.test(part)) continue;
    if (part.length < 3 || part.length > 40) continue;
    if (skip.has(part.toLowerCase())) continue;
    if (cityish.test(part)) continue;
    // Likely a name token if starts with capital and others look like names — keep job-like words
    if (/^[A-Za-z][A-Za-z+/& ]*$/.test(part) && !/^\d/.test(part)) {
      // Prefer known role-ish words or multi-part titles already joined
      if (
        /(ist|er|or|ant|ian|dev|engineer|manager|executive|officer|analyst|designer|developer|receptionist|accountant|hr|admin|sales|marketing|support|operator|technician|teacher|nurse|clerk)/i.test(
          part
        )
      ) {
        return part.replace(/([a-z])([A-Z])/g, "$1 $2").trim();
      }
    }
  }
  return "";
}

/**
 * Infer jobCategory when explicit label is missing: designation → experience title → filename.
 */
function inferJobCategoryFromTextAndName(text, fileName, professional = {}) {
  const prof =
    professional && typeof professional === "object" ? professional : {};
  const existing = String(prof.jobCategory || "").trim();
  if (existing) return existing;

  const designation = String(prof.designation || "").trim();
  if (designation) return designation;

  const fromExp = extractFirstExperienceTitle(text);
  if (fromExp) return fromExp;

  const fromName = extractJobCategoryFromFileName(fileName);
  if (fromName) return fromName;

  return "";
}

function enrichJobCategory(parsedData, textStr, fileName) {
  if (!parsedData || typeof parsedData !== "object") return parsedData;
  if (!parsedData.professional || typeof parsedData.professional !== "object") {
    parsedData.professional = {};
  }
  const prof = parsedData.professional;
  const fromExp = extractFirstExperienceTitle(textStr);
  const fromName = extractJobCategoryFromFileName(fileName);
  let designation = String(prof.designation || "").trim();

  const isUsableDesignation = (text) => {
    const t = String(text || "").trim();
    if (!t || t.length < 3) return false;
    if (/^s:$/i.test(t) || /^[:\-–—•·*|]+$/.test(t)) return false;
    const words = t.split(/\s+/).filter(Boolean);
    if (words.length > 10) return false;
    if (
      /\b(seek|seeking|challenging|opportunit|looking for|objective|career goal|success of the|fully use my skills)\b/i.test(
        t
      )
    ) {
      return false;
    }
    if (/[.!?]$/.test(t) && words.length > 6) return false;
    return true;
  };

  // Empty or garbage designation (objective sentence, "s:") → experience / filename
  if (!isUsableDesignation(designation)) {
    designation = isUsableDesignation(fromExp)
      ? fromExp
      : isUsableDesignation(fromName)
        ? fromName
        : "";
    prof.designation = designation;
  }

  if (prof.skill) {
    prof.skill = String(prof.skill)
      .replace(
        /\b((technical|professional|soft|key|core|computer|personal|additional)\s+)?skills?\s*(set|summary)?\b[:\-–—]*/gi,
        " "
      )
      .replace(/\s+/g, " ")
      .trim();
  }
  return parsedData;
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
        } else if (label.length > 4) {
          // Word-boundary only — avoid "State" matching inside "statements"
          const boundaryRe = new RegExp(
            `(?:^|[^a-z0-9])${lowerLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=[^a-z0-9]|$)`,
            "i"
          );
          const m = boundaryRe.exec(lowerLine);
          if (!m) continue;
          const idx = m.index + (m[0].length - lowerLabel.length);
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
  let street = extractAfterLabel(["Address Information", "Address", "Street Address", "Current Address"], ["State", "City", "Zip", "Area"]);
  if (street) street = street.replace(/^(address|information|details)\s+/i, "").trim();
  let state = extractAfterLabel(["State", "State Name"]);
  let city = extractAfterLabel(["City", "City Name"]);
  // Prefer compound labels first — plain "Area" alone turns "Area / Locality: Vesu" into "/ Locality: Vesu"
  let area = extractAfterLabel([
    "Area / Locality",
    "Area/Locality",
    "Area / Suburb",
    "Locality / Area",
    "Locality",
    "Suburb",
    "Landmark",
    "Area",
    "Near",
  ]);
  area = cleanAreaValue(area);
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
  if (!designation) {
    designation = extractFirstExperienceTitle(text) || "";
  }
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

  // Technical / Professional / Soft / Key skills — all go into the same skill field
  const skillSectionLabels = [
    "Technical Skills",
    "Professional Skills",
    "Soft Skills",
    "Computer Skills",
    "Key Skills",
    "Skill Set",
    "Skills",
  ];
  const skillChunks = [];
  const seenSkill = new Set();
  for (const label of skillSectionLabels) {
    const part = extractAfterLabel([label]);
    if (!part) continue;
    const cleaned = String(part)
      .replace(
        /\b((technical|professional|soft|key|core|computer|personal|additional)\s+)?skills?\s*(set|summary)?\b[:\-–—]*/gi,
        " "
      )
      .replace(/\s+/g, " ")
      .trim();
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seenSkill.has(key)) continue;
    seenSkill.add(key);
    skillChunks.push(cleaned);
  }
  let skill = skillChunks.join(", ");
  if (skill.includes("|")) {
    skill = skill
      .split("|")
      .map((s) => s.trim())
      .filter(Boolean)
      .join(", ");
  }
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

  // Map Education / Course labels into professional.field + course (form dropdowns)
  const { field: eduField, course: eduCourse } = deriveEducationFieldAndCourse(
    educationField,
    course,
    highestQualification
  );

  return {
    firstname,
    lastname,
    mobile,
    alternateMobile,
    email,
    gender,
    dateOfBirth,
    street,
    area: area || "",
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
      field: eduField || educationField || "",
      course: eduCourse || course || "",
      highestQualification
    }
  };
}

/**
 * Extract fields from text using OpenAI.
 */
async function queryOpenAi(text, credentials, masterBlock = "") {
  const { apiKey, model, baseUrl } = credentials;
  const url = `${baseUrl || "https://api.openai.com/v1"}/chat/completions`;
  const prompt = getAiPrompt(text, masterBlock);

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

  if (
    status === 404 ||
    msg.includes("not found") ||
    msg.includes("is not found") ||
    msg.includes("no longer available") ||
    msg.includes("status code 404") ||
    msg.includes("not_found_error")
  ) {
    err.code = "AI_MODEL_INVALID";
    if (provider === "claude") {
      err.message =
        "Claude model is invalid or retired. In Super Admin → OCR & API Configuration set Model to claude-haiku-4-5-20251001 (or claude-sonnet-4-6), Save, then try again.";
    } else if (provider === "openai") {
      err.message =
        "Invalid OpenAI model. Please set a current model (e.g. gpt-4o) in Super Admin → OCR & API Configuration.";
    } else {
      err.message =
        "Invalid or deprecated AI Model. Please set gemini-3.1-flash-lite in Super Admin → OCR & API Configuration.";
    }
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
async function queryGemini(text, credentials, masterBlock = "") {
  const { apiKey, model } = credentials;
  const preferred = (model || "").trim();
  const fallbackModels = [
    "gemini-3.1-flash-lite",
    "gemini-flash-lite-latest",
    "gemini-3.5-flash",
    "gemini-pro-latest",
    "gemini-2.5-pro",
    "gemini-flash-latest",
  ];
  const modelsToTry = [
    ...new Set(
      [preferred, ...fallbackModels].filter(Boolean)
    ),
  ];
  const prompt = getAiPrompt(text, masterBlock);
  const errors = [];
  let authError = null;
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  for (const activeModel of modelsToTry) {
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt > 0) {
        console.warn(`Retrying Gemini model ${activeModel} after 503 (attempt ${attempt + 1})...`);
        await sleep(2500);
      }
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
        break;
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
            attempt: attempt + 1,
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
          throw authError;
        }

        const retryable =
          status === 404 ||
          status === 429 ||
          status === 400 ||
          status === 503 ||
          status === 502;

        if (status === 503 || status === 502) {
          if (attempt === 0) continue; // retry same model once after delay
          console.warn(
            `Gemini model ${activeModel} still busy (${status}). Trying next model...`
          );
          break;
        }

        if (retryable) {
          console.warn(
            `Gemini model ${activeModel} failed (${status}): ${apiMsg}. Trying next model...`
          );
          break;
        }

        throw normalized;
      }
    }
  }

  if (authError) throw authError;

  const has503 = errors.some((e) => /high demand|503|overloaded|try again later/i.test(e));
  const has404 = errors.some((e) => /not found|404|no longer available/i.test(e));

  if (has404 && has503) {
    const err = new Error(
      "Gemini models are busy or deprecated. In Super Admin → OCR & API Configuration set Model to gemini-3.1-flash-lite, Save, then try again in a minute."
    );
    err.code = "AI_MODEL_INVALID";
    throw err;
  }

  if (has503) {
    throw buildAiError("gemini", 503, errors.join(" | "));
  }

  if (has404) {
    throw buildAiError("gemini", 404, errors.join(" | "));
  }

  throw new Error(
    "All Gemini models failed. Set Model to gemini-3.1-flash-lite in OCR & API Configuration."
  );
}

/**
 * Extract fields from text using Claude (with fallbacks for retired model IDs).
 */
const CLAUDE_FALLBACK_MODELS = [
  "claude-haiku-4-5-20251001",
  "claude-sonnet-4-6",
  "claude-3-5-sonnet-20241022",
];

async function queryClaude(text, credentials, masterBlock = "") {
  const { apiKey, model, baseUrl } = credentials;
  const url = `${baseUrl || "https://api.anthropic.com/v1"}/messages`;
  const prompt = getAiPrompt(text, masterBlock);
  const modelsToTry = [
    ...new Set([model, ...CLAUDE_FALLBACK_MODELS].filter(Boolean)),
  ];
  const errors = [];

  for (const activeModel of modelsToTry) {
    try {
      const response = await axios.post(
        url,
        {
          model: activeModel,
          max_tokens: 4000,
          messages: [{ role: "user", content: prompt }],
          temperature: 0.1,
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
    } catch (error) {
      const status = error.response?.status;
      const apiMsg =
        error.response?.data?.error?.message || error.message || "";
      errors.push(`${activeModel}: ${apiMsg}`);
      if (status === 401 || status === 403) {
        throw buildAiError("claude", status, apiMsg);
      }
      if (status === 429) {
        throw buildAiError("claude", status, apiMsg);
      }
      if (status === 404) {
        continue;
      }
    }
  }

  throw buildAiError("claude", 404, errors.join(" | "));
}

/**
 * Load Job Category + Sub Category master for AI prompt (exact names only).
 */
async function loadJobMasterForPrompt() {
  try {
    const JobCategory = require("../models-v2/jobCategory_Mongoose");
    const JobSubCategory = require("../models-v2/jobSubCategory_Mongoose");
    const cats = await JobCategory.find({}).select("id jobCategory").lean();
    const subs = await JobSubCategory.find({})
      .select("id jobCategoryId jobSubCategory")
      .lean();
    const byCat = {};
    for (const c of cats) {
      byCat[String(c.id)] = {
        id: c.id,
        name: c.jobCategory,
        subs: [],
      };
    }
    for (const s of subs) {
      const key = String(s.jobCategoryId || "");
      if (byCat[key]) byCat[key].subs.push(s.jobSubCategory);
    }
    const promptLines = Object.values(byCat).map((c) => {
      const subPart = c.subs.length
        ? c.subs.join(" | ")
        : "(no sub categories)";
      return `Category: ${c.name}\n  Sub Categories: ${subPart}`;
    });
    return {
      cats,
      subs,
      promptBlock:
        promptLines.join("\n") ||
        "(master list empty — leave jobCategory and jobSubCategory empty)",
    };
  } catch (err) {
    console.log("loadJobMasterForPrompt skipped:", err?.message || err);
    return { cats: [], subs: [], promptBlock: "" };
  }
}

/**
 * Map AI-returned category/sub names to DB ids. Names not in master → clear.
 */
function applyMasterJobCategoryFromAi(parsedData, cats = [], subs = []) {
  if (!parsedData || typeof parsedData !== "object") return parsedData;
  if (!parsedData.professional || typeof parsedData.professional !== "object") {
    parsedData.professional = {};
  }
  const prof = parsedData.professional;
  const norm = (s) =>
    String(s || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const rawCat =
    typeof prof.jobCategory === "string"
      ? prof.jobCategory
      : prof.jobCategory?.jobCategory || "";
  const rawSub =
    typeof prof.jobSubCategory === "string"
      ? prof.jobSubCategory
      : prof.jobSubCategory?.jobSubCategory ||
        prof.jobSubCategoryName ||
        "";

  const catNeedle = norm(rawCat);
  const subNeedle = norm(rawSub);

  let subDoc = subNeedle
    ? subs.find((s) => norm(s.jobSubCategory) === subNeedle)
    : null;
  let catDoc = null;

  if (subDoc) {
    catDoc = cats.find((c) => String(c.id) === String(subDoc.jobCategoryId));
  }
  if (!catDoc && catNeedle) {
    catDoc = cats.find((c) => norm(c.jobCategory) === catNeedle);
  }
  // If AI gave category + wrong sub, keep category and drop sub
  if (catDoc && subDoc && String(subDoc.jobCategoryId) !== String(catDoc.id)) {
    subDoc = null;
  }

  if (catDoc?.id) {
    prof.jobCategoryId = String(catDoc.id);
    prof.jobCategory = {
      id: String(catDoc.id),
      jobCategory: catDoc.jobCategory,
    };
  } else {
    delete prof.jobCategoryId;
    delete prof.jobCategory;
    delete prof.jobCategoryName;
  }

  if (subDoc?.id && catDoc?.id) {
    prof.jobSubCategoryId = String(subDoc.id);
    prof.jobSubCategory = {
      id: String(subDoc.id),
      jobSubCategory: subDoc.jobSubCategory,
      jobCategoryId: String(catDoc.id),
    };
  } else {
    delete prof.jobSubCategoryId;
    delete prof.jobSubCategory;
    delete prof.jobSubCategoryName;
  }

  parsedData.professional = prof;
  return parsedData;
}

/**
 * Generates prompt for the AI extractor.
 * masterBlock = formatted Job Category + Sub Category list from DB.
 */
function getAiPrompt(text, masterBlock = "") {
  const masterSection = masterBlock
    ? `
MASTER JOB CATEGORY / SUB CATEGORY LIST (from database — USE ONLY THESE EXACT NAMES):
${masterBlock}

jobCategory / jobSubCategory rules (CRITICAL):
1) Set professional.jobCategory to ONE exact Category name from the list above, OR empty.
2) Set professional.jobSubCategory to ONE exact Sub Category name from that same Category's list, OR empty.
3) NEVER invent names. NEVER paraphrase. NEVER return a category/sub that is not copied exactly from the list.
4) Decide using designation + experience job titles first; skills only support the decision.
5) Soft skills alone (communication, leadership, teamwork, etc.) → leave BOTH empty.
6) Certificate/course alone (e.g. Digital Marketing cert) without matching job title → leave empty.
7) Same meaning as a list role is OK (e.g. resume "Sales Associate" → list "Sales Executive" if that fits) — still return the LIST name only.
8) If unsure → both empty.
`
    : `
- professional.jobCategory: leave empty (master list unavailable).
- professional.jobSubCategory: leave empty.
`;

  return `You are an expert AI resume parser. Analyze the following resume text and extract all candidate details into a valid JSON object ONLY. 
Do not include any explanation or markdown formatting like \`\`\`json. Return the exact JSON structure specified below.

Schema requirements:
- Return personal and professional information exactly matching the fields below.
- Clean mobile numbers (remove spaces, hyphens).
- Return experienceInyear as a string (e.g. "4.5") OR one of the buckets below.
- Prefer calculating total experience from Work Experience date ranges (e.g. 2021-2023 = 2 years). Merge overlapping jobs; do not double-count. "Present"/"Current" = today.
- Extract street, area/locality, city, state, zip accurately.
- area is RESIDENTIAL locality only (e.g. Vesu, Varachha, Adajan). Return ONLY the locality name.
- NEVER put label words like "Area", "Locality", or "Area / Locality" into area.
- NEVER set area from Work Experience, company name, plant/site, or job location.
  Example: "working in ArcelorMittal, Hazira" → area must stay empty (Hazira is job site, not home).
- Only take area from Address / Area / Locality / Suburb / Current Address / residential LOCATION lines.
- If those lines have no locality, leave area empty. Do not guess from the rest of the resume.
- Examples:
  - "Area / Locality: Vesu" → area = "Vesu"
  - "Address: 201, Shreeji Residency, Near VR Mall, Vesu" + City Surat → area = "Vesu"
  - "LOCATION: Surat, INDIA" → city = Surat, area = empty
  - Job/company text mentioning Hazira/Adajan → do NOT copy into area
- Extract currentEmployer, designation, course, field, highestQualification accurately.
- professional.skill: merge ALL skill sections into one field — Technical Skills, Professional Skills, Soft Skills, Key Skills, Skill Set, Skills. Keep the skill values; do not drop any section. Only omit the heading words themselves.
- professional.field = education stream (e.g. B.Tech/B.E., MBA/PGDM). professional.course = specialization (e.g. Computers, Computer Engineering).
${masterSection}

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
  "area": "string (locality/suburb only) or empty",
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
    "jobCategory": "exact Category name from master list OR empty",
    "jobSubCategory": "exact Sub Category name from master list OR empty",
    "field": "string (e.g. B.Tech/B.E.) or empty",
    "course": "string (specialization) or empty",
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

const MONTH_NAME_TO_INDEX = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
};

/** Absolute month index (year*12 + month) for range math */
function toMonthIndex(year, monthIndex = 0) {
  const y = Number(year);
  const m = Number(monthIndex);
  if (!Number.isFinite(y) || y < 1970 || y > 2100) return null;
  if (!Number.isFinite(m) || m < 0 || m > 11) return null;
  return y * 12 + m;
}

function parseExperienceDateToken(token, { endOfPeriod = false } = {}) {
  const raw = String(token || "").trim().toLowerCase();
  if (!raw) return null;
  if (/^(present|current|till\s*date|to\s*date|ongoing|now)$/i.test(raw)) {
    const now = new Date();
    return toMonthIndex(now.getFullYear(), now.getMonth());
  }
  const monthYear = raw.match(
    /^(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s*[.\-\/]?\s*(\d{4})$/i
  );
  if (monthYear) {
    const m = MONTH_NAME_TO_INDEX[monthYear[1].toLowerCase()];
    return toMonthIndex(monthYear[2], m);
  }
  const yearOnly = raw.match(/^(\d{4})$/);
  if (yearOnly) {
    // Year-only ranges: 2021-2023 ≈ 2 years (Jan start → Jan end), not 3.
    return toMonthIndex(yearOnly[1], 0);
  }
  return null;
}

/**
 * Pull Work Experience block only (avoid Education year tables).
 */
function extractExperienceSectionText(text) {
  const raw = String(text || "").replace(/\r\n/g, "\n");
  const startRe =
    /(?:^|\n)\s*(?:work\s+experience|professional\s+experience|employment\s+history|experience)\s*(?:\n|:)/i;
  const startMatch = startRe.exec(raw);
  if (!startMatch) return "";
  const from = startMatch.index + startMatch[0].length;
  const rest = raw.slice(from);
  const endRe =
    /(?:^|\n)\s*(?:education|academic|skills?|key\s+skills|certifications?|languages?|contact|personal|projects?|declaration|hobbies|objective|summary|profile)\b/i;
  const endMatch = endRe.exec(rest);
  const block = endMatch ? rest.slice(0, endMatch.index) : rest;
  return block.slice(0, 4000);
}

/**
 * Parse employment date ranges from resume experience text.
 * Overlapping jobs are merged (union) so 2021-2023 twice ≠ 4 years.
 * Returns total years (float) or null when no usable ranges found.
 */
function calculateExperienceYearsFromDates(text) {
  const block = extractExperienceSectionText(text);
  if (!block || !block.trim()) return null;

  const rangeRe =
    /(?:(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s*[.\-\/]?\s*)?(\d{4})\s*(?:[-–—]|to)\s*(?:(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s*[.\-\/]?\s*)?(\d{4}|present|current|till\s*date|to\s*date|ongoing|now)/gi;

  const intervals = [];
  let m;
  while ((m = rangeRe.exec(block)) !== null) {
    const startToken = [m[1], m[2]].filter(Boolean).join(" ");
    const endToken = [m[3], m[4]].filter(Boolean).join(" ");
    const start = parseExperienceDateToken(startToken, { endOfPeriod: false });
    const end = parseExperienceDateToken(endToken, { endOfPeriod: true });
    if (start == null || end == null || end < start) continue;
    intervals.push({ start, end });
  }

  if (!intervals.length) return null;

  intervals.sort((a, b) => a.start - b.start);
  const merged = [{ ...intervals[0] }];
  for (let i = 1; i < intervals.length; i++) {
    const cur = intervals[i];
    const last = merged[merged.length - 1];
    if (cur.start <= last.end + 1) {
      last.end = Math.max(last.end, cur.end);
    } else {
      merged.push({ ...cur });
    }
  }

  const totalMonths = merged.reduce((sum, iv) => {
    let months = iv.end - iv.start;
    // Same month / same year-only entry → count as ~1 year of work
    if (months <= 0) months = 12;
    return sum + months;
  }, 0);
  if (totalMonths <= 0) return null;
  return Math.round((totalMonths / 12) * 10) / 10;
}

/**
 * Prefer Work Experience date ranges (union of periods) when present.
 * Fallback to AI / "Total Experience" label text.
 */
function resolveExperienceInYearFromResume(rawExperience, resumeText) {
  const yearsFromDates = calculateExperienceYearsFromDates(resumeText);
  if (yearsFromDates != null && Number.isFinite(yearsFromDates)) {
    return normalizeExperienceInYearValue(String(yearsFromDates));
  }
  return normalizeExperienceInYearValue(rawExperience);
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

/** Strip label leftovers like "/ Locality: Vesu" → "Vesu" */
function cleanAreaValue(raw) {
  let area = String(raw || "").trim();
  if (!area) return "";
  area = area
    .replace(/^\/?\s*locality\s*/i, "")
    .replace(/^\/?\s*suburb\s*/i, "")
    .replace(/^\/?\s*area\s*/i, "")
    .replace(/^[:\-–—|/]+\s*/g, "")
    .trim();
  // If still "Locality: Vesu" / "Area: Vesu"
  const afterColon = area.match(/^(?:area|locality|suburb)\s*[:\-–—|/]\s*(.+)$/i);
  if (afterColon) area = afterColon[1].trim();
  // Drop city-like values that are not localities when whole string is empty after clean
  if (/^(area|locality|suburb|select)$/i.test(area)) return "";
  return area;
}

/**
 * Pull locality from a free-form address line when Area label is missing.
 * e.g. "201, Shreeji Residency, Near VR Mall, Vesu" → Vesu
 */
function extractAreaFromStreet(street, city = "", state = "") {
  const raw = String(street || "").trim();
  if (!raw) return "";
  const skip = new Set(
    [city, state, "india", "gujarat", "address", "information"]
      .map((s) => String(s || "").toLowerCase().trim())
      .filter(Boolean)
  );
  const parts = raw.split(/[,|]/).map((p) => p.trim()).filter(Boolean);
  for (let i = parts.length - 1; i >= 0; i--) {
    let p = parts[i].replace(/^near\s+/i, "").trim();
    if (!p || skip.has(p.toLowerCase())) continue;
    if (/^\d+[\/\-]?\w*$/.test(p)) continue; // house / flat no.
    if (p.length < 3 || p.length > 45) continue;
    if (
      /^(residency|apartment|society|complex|tower|floor|block|road|street|marg|mall|park)$/i.test(
        p
      )
    ) {
      continue;
    }
    // Skip long building phrases; keep short locality tokens
    if (
      /\b(residency|apartment|society|complex|tower|floor|block)\b/i.test(p) &&
      p.split(/\s+/).length > 2
    ) {
      continue;
    }
    return cleanAreaValue(p);
  }
  return "";
}

function escapeRegex(str) {
  return String(str || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Only Address / Area / Locality / LOCATION-style lines — never Work Experience.
 * Used so job-site names (e.g. Hazira) are not treated as residential area.
 */
function extractAddressContextText(textStr) {
  const lines = String(textStr || "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const addressLabelRe =
    /^(address(?:\s+information)?|area(?:\s*\/\s*locality)?|locality|suburb|street(?:\s+address)?|location|current\s+address|residential(?:\s+address)?|landmark|pin(?:code)?|zip(?:\/postal)?(?:\s*code)?|city|state)\b/i;
  const sectionStopRe =
    /^(work\s+experience|experience|employment|professional\s+experience|career|projects?|education|academic|skills?|key\s+skills|certifications?|languages?|hobbies|objective|summary|profile|declaration|achievements?|responsibilities)\b/i;

  const chunks = [];
  let inAddressBlock = false;

  for (const line of lines) {
    if (sectionStopRe.test(line) && !addressLabelRe.test(line)) {
      inAddressBlock = false;
      continue;
    }
    if (addressLabelRe.test(line)) {
      inAddressBlock = true;
      chunks.push(line);
      continue;
    }
    if (inAddressBlock) {
      chunks.push(line);
    }
  }

  return chunks.join("\n");
}

/**
 * Area/city/state from areas master only.
 * - Area must appear in Address/Area/Locality/LOCATION context (or street field) — never from experience.
 * - Area in list + address context → store official name + fill city/state from that row.
 * - Otherwise area stays empty (do not guess from full resume / job site).
 */
async function enrichAreaFromDb(parsedData, textStr) {
  if (!parsedData || typeof parsedData !== "object") return parsedData;

  try {
    const Area = require("../models-v2/areas_Mongoose");
    let area = cleanAreaValue(parsedData.area);
    let city = String(parsedData.city || "").trim();
    let state = String(parsedData.state || "").trim();
    const street = String(parsedData.street || "").trim();

    const addressHay = [
      extractAddressContextText(textStr),
      street,
    ]
      .filter(Boolean)
      .join("\n")
      .toLowerCase();

    const areaMentionedInAddress = (name) => {
      const n = String(name || "").trim();
      if (n.length < 3 || !addressHay) return false;
      const re = new RegExp(
        `(?:^|[^a-z0-9])${escapeRegex(n)}(?:[^a-z0-9]|$)`,
        "i"
      );
      return re.test(addressHay);
    };

    if (area) {
      // Drop AI/regex area if it only came from experience / company text
      if (addressHay && !areaMentionedInAddress(area)) {
        parsedData.area = "";
        area = "";
      } else if (!addressHay) {
        // No address context at all → do not keep guessed area
        parsedData.area = "";
        area = "";
      }
    }

    if (area) {
      const nameFilter = {
        isActive: { $ne: false },
        name: { $regex: `^${escapeRegex(area)}$`, $options: "i" },
      };
      let doc = null;
      if (city || state) {
        const scoped = { ...nameFilter };
        if (city) {
          scoped.city = { $regex: `^${escapeRegex(city)}$`, $options: "i" };
        }
        if (state) {
          scoped.state = { $regex: `^${escapeRegex(state)}$`, $options: "i" };
        }
        doc = await Area.findOne(scoped)
          .select({ name: 1, city: 1, state: 1, _id: 0 })
          .lean();
      }
      if (!doc) {
        doc = await Area.findOne(nameFilter)
          .select({ name: 1, city: 1, state: 1, _id: 0 })
          .lean();
      }
      if (doc) {
        parsedData.area = doc.name;
        parsedData.city = doc.city || city;
        parsedData.state = doc.state || state;
        return parsedData;
      }
      // Not in master list — do not store free-text area
      parsedData.area = "";
    }

    // No valid area yet: only scan Address/LOCATION context (never full resume)
    if (!addressHay) return parsedData;

    city = String(parsedData.city || "").trim();
    state = String(parsedData.state || "").trim();
    if (!city) return parsedData;

    const filter = {
      isActive: { $ne: false },
      city: { $regex: `^${escapeRegex(city)}$`, $options: "i" },
    };
    if (state) {
      filter.state = { $regex: `^${escapeRegex(state)}$`, $options: "i" };
    }
    const areas = await Area.find(filter)
      .select({ name: 1, city: 1, state: 1, _id: 0 })
      .lean();
    if (!Array.isArray(areas) || !areas.length) return parsedData;

    const sorted = [...areas].sort(
      (a, b) => String(b.name || "").length - String(a.name || "").length
    );
    for (const a of sorted) {
      const name = String(a.name || "").trim();
      if (!areaMentionedInAddress(name)) continue;
      parsedData.area = name;
      if (a.city) parsedData.city = a.city;
      if (a.state) parsedData.state = a.state;
      return parsedData;
    }
  } catch (err) {
    console.log("enrichAreaFromDb skipped:", err?.message || err);
  }
  return parsedData;
}

/**
 * Fill empty AI fields from regex label parse (area / education / jobCategory etc.).
 * fileName is optional and used only as a jobCategory fallback hint.
 */
function mergeAiWithRegexFallback(aiData, textStr, fileName = "") {
  const regexData = smartRegexAndLabelParse(textStr || "");
  const merged = { ...(aiData || {}) };

  const fillTop = [
    "area",
    "city",
    "state",
    "street",
    "zip",
    "firstname",
    "lastname",
    "mobile",
    "email",
    "gender",
    "dateOfBirth",
    "languages",
    "certifications",
    "industry",
  ];
  for (const key of fillTop) {
    if (!merged[key] || String(merged[key]).trim() === "") {
      if (regexData[key]) merged[key] = regexData[key];
    }
  }

  merged.area = cleanAreaValue(merged.area);
  if (!merged.area) {
    merged.area =
      cleanAreaValue(regexData.area) ||
      extractAreaFromStreet(
        merged.street || regexData.street,
        merged.city || regexData.city,
        merged.state || regexData.state
      );
  }

  if (!Array.isArray(merged.education) || !merged.education.length) {
    if (Array.isArray(regexData.education) && regexData.education.length) {
      merged.education = regexData.education;
    }
  }

  const aiProf =
    merged.professional && typeof merged.professional === "object"
      ? { ...merged.professional }
      : {};
  const rxProf =
    regexData.professional && typeof regexData.professional === "object"
      ? regexData.professional
      : {};
  for (const key of Object.keys(rxProf)) {
    if (aiProf[key] === undefined || aiProf[key] === null || aiProf[key] === "") {
      if (rxProf[key] !== undefined && rxProf[key] !== null && rxProf[key] !== "") {
        aiProf[key] = rxProf[key];
      }
    }
  }
  merged.professional = aiProf;
  enrichJobCategory(merged, textStr, fileName);
  return merged;
}

/**
 * Derive form Education (field) + Course (specialization) from resume labels.
 */
function deriveEducationFieldAndCourse(educationField, course, highestQualification) {
  const blob = [educationField, course, highestQualification]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  let field = "";
  let courseOut = String(course || "").trim();

  if (/b\.?\s*tech|b\.?\s*e\b|bachelor of engineering|computer engineering/.test(blob)) {
    field = "B.Tech / B.E";
  } else if (/b\.?\s*arch/.test(blob)) {
    field = "B.Arch";
  } else if (/mba|pgdm/.test(blob)) {
    field = "MBA/PGDM";
  } else if (/diploma/.test(blob)) {
    field = "Diploma";
  } else if (/m\.?\s*tech|m\.?\s*e\b|master of technology/.test(blob)) {
    field = "M.Tech";
  } else if (/b\.?\s*com/.test(blob)) {
    field = "B.Com";
  } else if (/b\.?\s*sc/.test(blob)) {
    field = "B.Sc";
  } else if (/b\.?\s*c\.?\s*a/.test(blob)) {
    field = "B.C.A";
  }

  if (!courseOut && educationField) {
    // "B.E. in Computer Engineering" → specialization part
    const inMatch = String(educationField).match(/\bin\s+(.+)$/i);
    courseOut = inMatch ? inMatch[1].trim() : String(educationField).trim();
  }
  // Keep specialization text for frontend fuzzy match against Super Admin courses
  if (/^computers?$/i.test(courseOut.trim())) {
    courseOut = "Computer Science and Engineering (CSE)";
  }

  return { field, course: courseOut };
}

function normalizeParsedResumeData(parsedData, resumeText = "") {
  if (!parsedData || typeof parsedData !== "object") return parsedData;
  parsedData.gender = normalizeGenderValue(parsedData.gender);
  parsedData.area = cleanAreaValue(parsedData.area);
  if (!parsedData.professional || typeof parsedData.professional !== "object") {
    parsedData.professional = {};
  }
  const prof = parsedData.professional;
  prof.experienceInyear = resolveExperienceInYearFromResume(
    prof.experienceInyear,
    resumeText
  );
  prof.currentlyWorking = normalizeCurrentlyWorkingValue(prof.currentlyWorking);
  prof.noticePeriod = normalizeNoticePeriodValue(prof.noticePeriod);

  // Fill field/course from education[] when AI only returns that array
  const edu0 =
    Array.isArray(parsedData.education) && parsedData.education.length
      ? parsedData.education[0]
      : null;
  if (edu0) {
    const derived = deriveEducationFieldAndCourse(
      edu0.sub || edu0.name || "",
      prof.course || "",
      prof.highestQualification || edu0.name || ""
    );
    if (!prof.field && derived.field) prof.field = derived.field;
    if (!prof.course && derived.course) prof.course = derived.course;
    if (!prof.field && !derived.field && (edu0.sub || edu0.name)) {
      const again = deriveEducationFieldAndCourse(edu0.sub, edu0.name, "");
      if (again.field) prof.field = again.field;
      if (!prof.course && again.course) prof.course = again.course;
    }
  } else if (!prof.field || !prof.course) {
    const derived = deriveEducationFieldAndCourse(
      prof.field || "",
      prof.course || "",
      prof.highestQualification || ""
    );
    if (!prof.field && derived.field) prof.field = derived.field;
    if (!prof.course && derived.course) prof.course = derived.course;
  }

  prof.highestQualification = normalizeHighestQualificationValue(
    prof.highestQualification || prof.course || (edu0 && edu0.name) || ""
  );

  // Same rule as candidate form: Expected Monthly = Current × 1.2
  const currentSal = Number(prof.currentSalary);
  if (Number.isFinite(currentSal) && currentSal > 0) {
    prof.expectedsalary = Math.round(currentSal * 1.2);
  }

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
      const pdfExtract = await extractTextFromPdfWithOcrFallback(fileData);
      textStr = pdfExtract.text;
      sourceLabel = pdfExtract.usedOcr ? "PDF OCR Extraction" : "PDF Extraction";
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

  const master = await loadJobMasterForPrompt();
  const masterBlock = master.promptBlock || "";
  console.log(
    `Job master for AI: ${master.cats.length} categories, ${master.subs.length} sub categories`
  );

  try {
    let rawJsonText = "";
    switch (provider) {
      case "openai":
        rawJsonText = await queryOpenAi(textStr, credentials, masterBlock);
        break;
      case "claude":
        rawJsonText = await queryClaude(textStr, credentials, masterBlock);
        break;
      case "gemini":
      default:
        rawJsonText = await queryGemini(textStr, credentials, masterBlock);
        break;
    }

    if (!rawJsonText || !String(rawJsonText).trim()) {
      throw new Error("AI returned empty response");
    }

    const parsedData = mergeAiWithRegexFallback(
      parseAiJsonResponse(rawJsonText),
      textStr,
      fileName
    );

    if (!parsedData || typeof parsedData !== "object") {
      throw new Error("AI returned invalid JSON structure");
    }

    normalizeParsedResumeData(parsedData, textStr);
    enrichJobCategory(parsedData, textStr, fileName);
    applyMasterJobCategoryFromAi(parsedData, master.cats, master.subs);
    await enrichAreaFromDb(parsedData, textStr);

    console.log("Parsed area after AI+regex+DB:", parsedData.area || "(empty)");
    console.log(
      "Parsed jobCategory after master map:",
      parsedData?.professional?.jobCategory?.jobCategory ||
        parsedData?.professional?.jobCategory ||
        "(empty)",
      "| sub:",
      parsedData?.professional?.jobSubCategory?.jobSubCategory || "(empty)"
    );

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
    const apiMsg =
      aiError.response?.data?.error?.message ||
      aiError.response?.data?.error?.type ||
      aiError.message;
    const normalized = buildAiError(
      provider,
      aiError.response?.status,
      apiMsg
    );
    const rawMsg = String(aiError.message || "");
    const isAxiosNoise = /request failed with status code/i.test(rawMsg);
    if (
      !isAxiosNoise &&
      aiError.message &&
      !/oauth|credential|sign-in|developers\.google/i.test(aiError.message) &&
      normalized.code === "AI_PARSE_FAILED"
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
  smartRegexAndLabelParse,
  calculateExperienceYearsFromDates,
  resolveExperienceInYearFromResume,
  normalizeExperienceInYearValue,
};
