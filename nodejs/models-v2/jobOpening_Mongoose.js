const mongoose = require("mongoose");

const Schema = mongoose.Schema;
const model = mongoose.model;
const objectid = new mongoose.Types.ObjectId();

const jobOpening = new Schema(
  {
    _id: {
      type: String,
      default: objectid,
    },
    id: {
      type: String,
    },
    userId: String,
    jobCategoryId: String,
    industriesId: String,
    numberOfVacancy: Number,
    hotvacancy: {
      type: Date,
      default: new Date(),
    },
    jobStartTime: String,
    jobEndTime: String,
    sunday: String,
    minExperienceYears: String,
    qualification: String,
    field: String,
    course: String,
    designation: String,
    salaryRangeStart: { type: Number, default: 0 },
    salaryRangeEnd: { type: Number, default: 0 },
    negotiable: String,
    jobLocation: String,
    basicSkill: String,
    keyRole: String,
    workingDays: { type: Number, default: 5 },
    plSlCl: { type: Number, default: 0 },
    healthPolicy: String,
    pfEsic: { type: Number, default: 0 },
    other: String,
    gender: String,
    workType: String,
    // Extended job posting fields
    companyName: String,
    clientId: String,
    department: String,
    employmentType: String,
    salary: String,
    jobSummary: String,
    preferredSkills: String,
    benefits: String,
    companyOverview: String,
    callToAction: String,
    jobDescription: String,
    postingStatus: {
      type: String,
      enum: ["draft", "open", "published", "closed", "archived"],
      default: "open",
    },
    recruiterId: String,
    expiryDate: Date,
  },
  { collection: "jobOpening", timestamps: true, versionKey: false }
);

const JobOpening = model("jobOpening", jobOpening);
module.exports = JobOpening;
