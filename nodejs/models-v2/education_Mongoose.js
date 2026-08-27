const mongoose = require("mongoose");

const Schema = mongoose.Schema;
const model = mongoose.model;

const educationSchema = new Schema(
  {
    id: { type: String, index: true },
    name: { type: String, required: true, index: true },
    qualification: { type: String, required: true, index: true },
    isdeleted: { type: Number, default: 0 },
  },
  { collection: "educations", timestamps: true, versionKey: false }
);

educationSchema.index({ qualification: 1, name: 1 });

const Education = model("educations", educationSchema);
module.exports = Education;
