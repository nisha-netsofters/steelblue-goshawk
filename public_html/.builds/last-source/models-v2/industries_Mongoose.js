const mongoose = require("mongoose");

const Schema = mongoose.Schema;
const model = mongoose.model;

const industries = new Schema(
  {
    id: {
      type: String,
    },
    industryCategory: String,
    comments: String,
  },
  { collection: "industries",  timestamps: true , versionKey: false }
);

const Industries = model("industries", industries);

module.exports = Industries;