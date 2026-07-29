const { SafeString } = require("handlebars");
const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const model = mongoose.model;

const candidates = new Schema(
  {
    id: {
      type: String,
    },
    jobOpeningId: String,
    userId: { type: String, index: true },
    interviewerId: { type: String, index: true },
    firstname: String,
    lastname: String,
    mobile: {
      type: String,
      // unique: true,
    },
    email: {
      type: String,
      // unique: true,
    },
    street: String,
    city: { type: String, index: true },
    state: String,
    zip: String,
    alternateMobile: String,
    status: {
      type: String,
      default: "new",
    },
    comments: String,
    gender: String,
    certifications: String,
    image: String,
    resume: String,
    interviewStatusUpdate: {
      type: String,
    },
    interviewStatus: { type: String, default: "available" },
    whatsappMsg: { type: Boolean, default: false },
    cityId: String,
    stateId: String,
    agencyId: { type: String, index: true },
    savedCandidates: Object,
    interviews: Object,
    industries_relation: [
      {
        id: String,
        _id: String,
        createdAt: { type: Date, index: true },
        cId: String,
        industriesId:  { type: String, index: true },
        industries: {
          _id: String,
          id: String,
          comments: String,
          createdAt: { type: Date, index: true },
          industryCategory: String,
          updatedAt: Date,
          agencyId: String,
        },
      },
    ],
    professional: {
      experienceInyear: String,
      highestQualification: String,
      field: String,
      course: String,
      designation: String,
      jobCategoryId: { type: String, index: true },
      currentEmployer: String,
      currentSalary: Number,
      expectedsalary: Number,
      noticePeriod: String,
      currentlyWorking: String,
      english: String,
      preferedJobLocation: String,
      skill:String,
      jobCategory: {
        _id: String,
        id: String,
        comments: String,
        createdAt:  { type: Date, index: true },
        isdeleted: Number,
        jobCategory: String,
        updatedAt: Date,
        agencyId: String,
      },
    },
  },
  { collection: "candidates", versionKey: false, timestamps: true }
);

const Candidates = model("candidates", candidates);
module.exports = Candidates;
