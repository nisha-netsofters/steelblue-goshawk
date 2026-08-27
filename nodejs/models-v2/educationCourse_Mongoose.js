const mongoose = require("mongoose");

const Schema = mongoose.Schema;
const model = mongoose.model;

const educationCourseSchema = new Schema(
  {
    id: { type: String, index: true },
    name: { type: String, required: true, index: true },
    educationId: { type: String, required: true, index: true },
    educationName: { type: String, default: "" },
    qualification: { type: String, default: "" },
    isdeleted: { type: Number, default: 0 },
  },
  { collection: "educationCourses", timestamps: true, versionKey: false }
);

educationCourseSchema.index({ educationId: 1, name: 1 });

const EducationCourse = model("educationCourses", educationCourseSchema);
module.exports = EducationCourse;
