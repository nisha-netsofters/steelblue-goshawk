const mongoose = require("mongoose");

const Schema = mongoose.Schema;
const model = mongoose.model;

const interviewStatusmodel = new Schema(
  {
    id: {
      type: String,
    },
    agencyId: { type: String, index: true },
    candidateid: { type: String, index: true },
    interviewStatus: String,
    userId: String,
    ClientId: String,
    // clientId: String,
    interviewId: {
      type: String,
      default: null,
    },
    interviewStatusUpdate: {
      type: Date,
      default: new Date().toISOString(),
      index: true
    },
  },
  { collection: "interviewStatus", versionKey: false, timestamps: true }
);

const interviewStatus = model("interviewStatus", interviewStatusmodel);

module.exports = interviewStatus;
