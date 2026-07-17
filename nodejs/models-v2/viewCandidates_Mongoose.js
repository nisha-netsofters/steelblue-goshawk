const mongoose = require("mongoose");

const Schema = mongoose.Schema;
const model = mongoose.model;

const viewCandidatesmodel = new Schema(
  {
    id: {
      type: String,
    },
    agencyId: { type: String, index: true },
    userId: { type: Array, index: true },
    candidateid: { type: String, index: true },
  },
  { collection: "viewCandidates", versionKey: false }
);

const viewCandidates = model("viewCandidates", viewCandidatesmodel);

module.exports = viewCandidates;
