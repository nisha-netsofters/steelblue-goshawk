const mongoose = require("mongoose");

const Schema = mongoose.Schema;
const model = mongoose.model;

const recruiterInternalComments = new Schema(
  {
    id: { type: String },
    candidateId: { type: String, index: true },
    userId: { type: String, index: true },
    authorName: { type: String },
    agencyId: { type: String, index: true },
    comment: { type: String },
    visibleToClient: { type: Boolean, default: false },
    isdeleted: { type: Number, default: 0 },
  },
  {
    collection: "recruiterInternalComments",
    timestamps: true,
    versionKey: false,
  }
);

const RecruiterInternalComments = model(
  "recruiterInternalComments",
  recruiterInternalComments
);

module.exports = RecruiterInternalComments;
