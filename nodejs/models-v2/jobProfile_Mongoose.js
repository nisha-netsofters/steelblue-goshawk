
const mongoose = require("mongoose");

const Schema = mongoose.Schema;
const model = mongoose.model;

const jobProfile = new Schema(
  {
    id: {
      type: String,
    },
    companyId: String,
    userId: String,
    name: String,
    email: String,
    mobile: String,
    website: String,
    designation: String,
    agencyId:String,
    experience: String,
    noOfVacancy: Number,
    jobTime: Object,
    sunday: String,
    freshersAllowed: String,
    work: String,
    negotiable: String,
    joiningStatus: String,
    gender: String,
    qualification: String,
    salaryRange: Object,
    jobLocation: String,
    skill: String,
    keyRole: String,
    workingDays: String,
    leave: String,
    healthPolicy: String,
    pf: String,
    others: String,
    comments: String,
    isdeleted: {type:Number,default:0},
  },
  { collection: "jobProfile", timestamps: true, versionKey: false }
);

const JobProfile = model("jobProfile", jobProfile);
module.exports = JobProfile

