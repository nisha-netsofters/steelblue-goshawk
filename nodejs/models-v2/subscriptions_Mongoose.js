const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const model = mongoose.model;

const subscriptions = new Schema(
  {
    id: {
      type: String,
    },
    planId: String,
    userId: String,
    agencyId: String,
    payment_id: {
      type: String,
      default: null,
    },
    active_plan: {
      type: Boolean,
      default: null,
    },
    timeDuration: String,
    resume_download_count: { type: Number, default: 0 },
    interview_request_count: { type: Number, default: 0 },
    // planId: String,
    // userId: String,
    // paymentId: { type: String, default: null },
    // activePlan: Boolean,
    // timeDuration: String,
    // resumeDownloadCount: { type: Number, default: 0 },
    // interviewRequestCount: { type: Number, default: 0 },
  },
  { collection: "subscriptions", timestamps: true, versionKey: false }
);

const Subscription = model("subscriptions", subscriptions);
module.exports = Subscription;
