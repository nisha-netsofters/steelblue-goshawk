/**
 * Import State/City/Area CSV into MongoDB `areas` collection.
 *
 * Usage:
 *   node scripts/importAreasFromCsv.js [path-to-csv]
 */
require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const { v4: uuid } = require("uuid");
const Area = require("../models-v2/areas_Mongoose");

function parseCsv(text) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const headers = splitCsvLine(lines[0]).map((h) => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = (cols[idx] || "").trim();
    });
    rows.push(obj);
  }
  return rows;
}

function splitCsvLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

async function main() {
  const csvPath =
    process.argv[2] ||
    path.join(__dirname, "../data/State_City_Area_Complete.csv");

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL missing in .env");
  }
  if (!fs.existsSync(csvPath)) {
    throw new Error(`CSV not found: ${csvPath}`);
  }

  const records = parseCsv(fs.readFileSync(csvPath, "utf8"));
  const rows = [];
  const seen = new Set();
  for (const row of records) {
    const state = String(row.State || row.state || "").trim();
    const city = String(row.City || row.city || "").trim();
    const name = String(
      row["Major Area / Locality"] || row.area || row.Area || ""
    ).trim();
    if (!state || !city || !name) continue;
    const key = `${state.toLowerCase()}|${city.toLowerCase()}|${name.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ state, city, name });
  }

  console.log(`Parsed ${rows.length} unique areas from CSV`);

  await mongoose.connect(process.env.DATABASE_URL);
  console.log("Mongo connected");

  const del = await Area.deleteMany({});
  console.log(`Cleared existing areas: ${del.deletedCount}`);

  const docs = rows.map((r) => ({
    id: uuid(),
    state: r.state,
    city: r.city,
    name: r.name,
    isActive: true,
  }));

  const chunk = 500;
  let inserted = 0;
  for (let i = 0; i < docs.length; i += chunk) {
    const slice = docs.slice(i, i + chunk);
    await Area.insertMany(slice, { ordered: false });
    inserted += slice.length;
    console.log(`Inserted ${inserted}/${docs.length}`);
  }

  const total = await Area.countDocuments();
  console.log(`Done. areas collection count = ${total}`);
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  try {
    await mongoose.disconnect();
  } catch (_) {}
  process.exit(1);
});
