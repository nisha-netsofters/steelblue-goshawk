const mongoose = require("mongoose");

const Schema = mongoose.Schema;
const model = mongoose.model;

const interviews = new Schema(
  {
    id: {
      type: String,
    },
    candidateId: { type: String, index: true },
    onBoardingId: String,
    userId: String,
    date: String,
    joiningDate: String,
    startingSalary: Number,
    time: Date,
    link: String,
    interviewType: String,
    comments: String,
    agencyId: { type: String, index: true },
    isdeleted: { type: Number, default: 0 },
  },
  { collection: "interviews", timestamps: true, versionKey: false }
);

const Interviews = model("interviews", interviews);
module.exports = Interviews;
