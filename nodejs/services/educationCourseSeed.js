const path = require("path");
const { v4: uuid } = require("uuid");
const Education = require("../models-v2/education_Mongoose");
const EducationCourse = require("../models-v2/educationCourse_Mongoose");

const QUALIFICATION = {
  UNDER: "under graduate",
  GRAD: "graduation",
  POST: "post graduate",
};

const SEED = [
  { qualification: QUALIFICATION.UNDER, name: "Under 12th", sub: [] },
  {
    qualification: QUALIFICATION.UNDER,
    name: "Diploma",
    sub: [
      "Any Specialization",
      "Chemical",
      "Civil",
      "Computer",
      "Electrical",
      "Electronics/Telecommunication",
      "Engineering",
      "Export/Import",
      "Fashion Designing/Other Designing",
      "Graphic/ Web Designing",
      "Hotel Management",
      "Insurance",
      "Management",
      "Mechanical",
      "Tourism",
      "Visual Arts",
      "Vocational Course",
      "Others",
    ],
  },
  {
    qualification: QUALIFICATION.GRAD,
    name: "B.Architect",
    sub: ["Any Specialization", "Architecture", "Others"],
  },
  {
    qualification: QUALIFICATION.GRAD,
    name: "B.Tech/B.E.",
    sub: [
      "Any Specialization",
      "Agriculture",
      "Automobile",
      "Aviation",
      "Bio-Chemistry/Bio-Technology",
      "Biomedical",
      "Ceramics",
      "Chemical",
      "Civil",
      "Computers",
      "Electrical",
      "Electronics/Telecommunication",
      "Energy",
      "Environmental",
      "Instrumentation",
      "Marine",
      "Mechanical",
      "Metallurgy",
      "Mineral",
      "Mining",
      "Nuclear",
      "Paint/Oil",
      "Petroleum",
      "Plastics",
      "Production/Industrial",
      "Textile",
      "Others",
    ],
  },
  { qualification: QUALIFICATION.UNDER, name: "Any Hotel-Management", sub: [] },
  {
    qualification: QUALIFICATION.UNDER,
    name: "Journalism/Mass Communication",
    sub: [],
  },
  { qualification: QUALIFICATION.UNDER, name: "Vocational-Training", sub: [] },
  { qualification: QUALIFICATION.GRAD, name: "B.A.", sub: [] },
  {
    qualification: QUALIFICATION.GRAD,
    name: "B.B.A./ B.M.S.",
    sub: ["HR", "Finance", "Marketing"],
  },
  { qualification: QUALIFICATION.GRAD, name: "B.Com", sub: [] },
  {
    qualification: QUALIFICATION.GRAD,
    name: "B.Pharma",
    sub: ["Any Specialization", "Physical Education", "Others"],
  },
  {
    qualification: QUALIFICATION.GRAD,
    name: "B.Sc",
    sub: [
      "Any Specialization",
      "Agriculture",
      "Anthropology",
      "Bio-Chemistry",
      "Biology",
      "Botany",
      "Chemistry",
      "Computers",
      "Dairy Technology",
      "Electronics",
      "Environmental Science",
      "Food Technology",
      "Geology",
      "Home Science",
      "Maths",
      "Microbiology",
      "Nursing",
      "Physics",
      "Statistics",
      "Zoology",
      "General",
      "Hospitality and Hotel Management",
      "Optometry",
      "Others",
    ],
  },
  {
    qualification: QUALIFICATION.GRAD,
    name: "BCA",
    sub: ["Any Specialization", "Computers", "Others"],
  },
  {
    qualification: QUALIFICATION.GRAD,
    name: "LLB",
    sub: ["Any Specialization", "Law", "Others"],
  },
  { qualification: QUALIFICATION.GRAD, name: "Other Graduate", sub: [] },
  {
    qualification: QUALIFICATION.POST,
    name: "CA",
    sub: [
      "Any Specialization",
      "CA",
      "Pursuing",
      "First Attempt",
      "Second Attempt",
      "Others",
    ],
  },
  {
    qualification: QUALIFICATION.POST,
    name: "CS",
    sub: ["Any Specialization", "CS", "Others"],
  },
  {
    qualification: QUALIFICATION.POST,
    name: "ICWA (CMA)",
    sub: ["Any Specialization", "ICWA (CMA)", "Others"],
  },
  {
    qualification: QUALIFICATION.POST,
    name: "Integrated PG",
    sub: [
      "Any Specialization",
      "Journalism / Mass Communication",
      "Management",
      "PR/ Advertising",
      "Tourism",
      "Others",
    ],
  },
  {
    qualification: QUALIFICATION.POST,
    name: "M.A.",
    sub: [
      "Any Specialization",
      "Anthropology",
      "Arts & Humanities",
      "Communication",
      "Economics",
      "English",
      "Film",
      "Fine Arts",
      "Hindi",
      "History",
      "Journalism",
      "Maths",
      "Political Science",
      "PR/ Advertising",
      "Psychology",
      "Sanskrit",
      "Sociology",
      "Statistics",
      "Others",
    ],
  },
  {
    qualification: QUALIFICATION.POST,
    name: "M.Com",
    sub: ["Any Specialization", "Commerce", "Others"],
  },
  {
    qualification: QUALIFICATION.POST,
    name: "M.Ed",
    sub: ["Any Specialization", "Education", "Others"],
  },
  {
    qualification: QUALIFICATION.POST,
    name: "M.Pharma",
    sub: ["Any Specialization", "Pharmacy", "Others"],
  },
  {
    qualification: QUALIFICATION.POST,
    name: "M.Tech",
    sub: [
      "Any Specialization",
      "Agriculture",
      "Automobile",
      "Aviation",
      "Bio-Chemistry/Bio-Technology",
      "Biomedical",
      "Ceramics",
      "Chemical",
      "Civil",
      "Computers",
      "Electrical",
      "Electronics/Telecommunication",
      "Energy",
      "Environmental",
      "Instrumentation",
      "Marine",
      "Mechanical",
      "Metallurgy",
      "Mineral",
      "Mining",
      "Nuclear",
      "Paint/Oil",
      "Petroleum",
      "Plastics",
      "Production/Industrial",
      "Textile",
      "Others",
    ],
  },
  {
    qualification: QUALIFICATION.POST,
    name: "MBA/PGDM",
    sub: [
      "Any Specialization",
      "Advertising/Mass Communication",
      "Finance",
      "HR/Industrial Relations",
      "Information Technology",
      "International Business",
      "Marketing",
      "Systems",
      "Operations",
      "Hospitality Management",
      "Others",
    ],
  },
  {
    qualification: QUALIFICATION.POST,
    name: "MCA",
    sub: ["Any Specialization", "Computers", "Others"],
  },
  {
    qualification: QUALIFICATION.POST,
    name: "M.Sc(Science)",
    sub: [
      "Any Specialization",
      "Agriculture",
      "Anthropology",
      "Bio-Chemistry",
      "Biology",
      "Botany",
      "Chemistry",
      "Computers",
      "Dairy Technology",
      "Electronics",
      "Environmental science",
      "Food Technology",
      "Geology",
      "Home science",
      "Maths",
      "Microbiology",
      "Nursing",
      "Physics",
      "Statistics",
      "Zoology",
      "Biotechnology",
      "Organic Chemistry",
      "Optometry",
      "Others",
    ],
  },
  {
    qualification: QUALIFICATION.POST,
    name: "PG Diploma",
    sub: [
      "Any Specialization",
      "Chemical",
      "Civil",
      "Computers",
      "Electrical",
      "Electronics",
      "Mechanical",
      "Others",
    ],
  },
  { qualification: QUALIFICATION.POST, name: "Other Post Graduate", sub: [] },
];

function loadDocEducationSeed() {
  const jsonPath = path.join(__dirname, "../data/educationFromDocs.json");
  // eslint-disable-next-line import/no-dynamic-require, global-require
  const json = require(jsonPath);
  return [
    ...(json.graduation || []),
    ...(json["post graduate"] || []),
  ].map((item) => ({
    qualification: item.qualification,
    name: item.name,
    sub: item.courses || item.sub || [],
  }));
}

function seedItems() {
  const under = SEED.filter((item) => item.qualification === QUALIFICATION.UNDER);
  return [...under, ...loadDocEducationSeed()];
}

async function seedEducationCourses() {
  const educationDocs = [];
  const courseDocs = [];

  for (const item of seedItems()) {
    const educationId = uuid();
    educationDocs.push({
      id: educationId,
      name: item.name,
      qualification: item.qualification,
      isdeleted: 0,
    });
    (item.sub || []).forEach((subName) => {
      const name = String(subName || "").replace(/^,/, "").trim();
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
    await EducationCourse.insertMany(courseDocs);
  }
  return {
    educations: educationDocs.length,
    courses: courseDocs.length,
  };
}

async function ensureEducationSeeded() {
  const count = await Education.countDocuments({ isdeleted: { $ne: 1 } });
  if (count > 0) return { seeded: false, count };
  const result = await seedEducationCourses();
  return { seeded: true, ...result };
}

module.exports = {
  QUALIFICATION,
  SEED,
  seedEducationCourses,
  ensureEducationSeeded,
};
