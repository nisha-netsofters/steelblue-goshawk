const mongoose = require("mongoose");

const jobApplicationSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
      unique: true,
    },
    jobOpeningId: {
      type: String,
      required: true,
    },
    candidateId: {
      type: String,
      required: true,
    },
    clientId: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ["applied", "viewed", "interviewed", "rejected", "hired"],
      default: "applied",
    },
  },
  { timestamps: true }
);

const JobApplication = mongoose.model("JobApplication", jobApplicationSchema);
jobApplicationSchema.index({ jobOpeningId: 1 });

module.exports = JobApplication;
