const mongoose = require("mongoose");

const Schema = mongoose.Schema;
const model = mongoose.model;

const education = new Schema(
  {
    _id: {
      type: Types.ObjectId,
      default: Types.ObjectId, // generates a new ObjectId by default
    },
    id: {
      type: String,
    },
    candidateId: String,
    institute: String,
    agencyId: String,
    degree: String,
    department: String,
    english: String,
    eductionDuration: String,
  },
  { collection: "education", versionKey: false, timestamps: true }
);

const Education = model("education", education);
module.exports = Education;
