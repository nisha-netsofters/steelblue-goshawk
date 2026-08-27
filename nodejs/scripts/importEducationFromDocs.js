/**
 * Replace Graduation + Post Graduate education/course lists from scraped Word docs.
 *
 * Usage:
 *   node scripts/importEducationFromDocs.js
 */
require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const { v4: uuid } = require("uuid");
const Education = require("../models-v2/education_Mongoose");
const EducationCourse = require("../models-v2/educationCourse_Mongoose");

const QUALIFICATIONS = ["graduation", "post graduate"];

async function main() {
  const jsonPath = path.join(__dirname, "../data/educationFromDocs.json");
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL missing in .env");
  }
  if (!fs.existsSync(jsonPath)) {
    throw new Error(`JSON not found: ${jsonPath}`);
  }

  const json = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  const items = [
    ...(json.graduation || []),
    ...(json["post graduate"] || []),
  ];
  if (!items.length) {
    throw new Error("No education rows in JSON");
  }

  await mongoose.connect(process.env.DATABASE_URL);
  console.log("Mongo connected");

  const eduDel = await Education.deleteMany({
    qualification: { $in: QUALIFICATIONS },
  });
  const courseDel = await EducationCourse.deleteMany({
    qualification: { $in: QUALIFICATIONS },
  });
  console.log(
    `Removed old graduation/PG: educations=${eduDel.deletedCount} courses=${courseDel.deletedCount}`
  );

  const educationDocs = [];
  const courseDocs = [];
  for (const item of items) {
    const educationId = uuid();
    educationDocs.push({
      id: educationId,
      name: item.name,
      qualification: item.qualification,
      isdeleted: 0,
    });
    (item.courses || []).forEach((subName) => {
      const name = String(subName || "").trim();
      if (!name) return;
      courseDocs.push({
        id: uuid(),
        name,
        educationId,
        educationName: item.name,
        qualification: item.qualification,
        isdeleted: 0,
      });
    });
  }

  if (educationDocs.length) {
    await Education.insertMany(educationDocs);
  }
  if (courseDocs.length) {
    const chunk = 500;
    for (let i = 0; i < courseDocs.length; i += chunk) {
      await EducationCourse.insertMany(courseDocs.slice(i, i + chunk));
    }
  }

  const gradCount = await Education.countDocuments({
    qualification: "graduation",
    isdeleted: { $ne: 1 },
  });
  const pgCount = await Education.countDocuments({
    qualification: "post graduate",
    isdeleted: { $ne: 1 },
  });
  const courseCount = await EducationCourse.countDocuments({
    qualification: { $in: QUALIFICATIONS },
    isdeleted: { $ne: 1 },
  });
  console.log(
    `Done. graduation=${gradCount} postGraduate=${pgCount} courses=${courseCount}`
  );
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  try {
    await mongoose.disconnect();
  } catch (_) {}
  process.exit(1);
});
