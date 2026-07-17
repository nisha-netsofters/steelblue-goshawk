const mongoose = require("mongoose");

const Schema = mongoose.Schema;
const model = mongoose.model;

const resumeEnquiry = new Schema(
  {
    id: { type: String },
    candidateId: { type: String, index: true },
    userId: { type: String, index: true },
    agencyId: { type: String, index: true },
    status: { type: String, default: "requested", enum: ["requested", "completed","rejected","inreview"] },
    message: { type: String },
  },
  { collection: "resumeEnquiries", versionKey: false, timestamps: true }
);

const ResumeEnquiry = model("resumeEnquiries", resumeEnquiry);
module.exports = ResumeEnquiry;
