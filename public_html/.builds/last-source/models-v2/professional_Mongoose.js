const mongoose = require("mongoose");

const Schema = mongoose.Schema;
const model = mongoose.model;

const professional = new Schema(
  {
    id: {
      type: String,
    },
    candidateId: String,
    jobCategoryId: String,
    industriesId: String,
    course: String,
    field: String,
    designation: String,
    agencyId: String,
    experienceInyear: String,
    expectedsalary: String,
    skill: String,
    noticePeriod: String,
    highestQualification: String,
    currentlyWorking: String,
    currentSalary: String,
    currentEmployer: String,
    english: String,
    preferedJobLocation: String,
  },
  { collection: "professional", versionKey: false, timestamps: true }
);

const Professional = model("professional", professional);
module.exports = Professional; 
