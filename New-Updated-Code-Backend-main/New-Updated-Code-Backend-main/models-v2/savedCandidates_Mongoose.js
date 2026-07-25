const mongoose = require("mongoose");

const Schema = mongoose.Schema;
const model = mongoose.model;
const savedCandidates = new Schema(
  {
    id: {
      type: String,
    },
    userId: String,
    candidateId: String,
    agencyId: String,
  },
  {
    collection: "savedCandidates",
    versionKey: false,
    timeseries: true,
    timestamps: true,
  }
);

const Saved_candidates = model("savedCandidates", savedCandidates);

module.exports = Saved_candidates;
