const mongoose = require("mongoose");

const Schema = mongoose.Schema;
const model = mongoose.model;

const interviewRequest = new Schema(
  {
    id: {
      type: String,
    },
    userId: String,
    candidateId: String,
    clientId: String,
  },
  { collection: "interviewRequest", versionKey: false, timestamps: true }
);

const InterviewRequest = model("interviewRequest", interviewRequest);

module.exports = InterviewRequest;
