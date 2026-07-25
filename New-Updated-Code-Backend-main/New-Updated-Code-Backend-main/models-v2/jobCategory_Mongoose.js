const mongoose = require("mongoose");

const Schema = mongoose.Schema;
const model = mongoose.model;

 const jobCategory = new Schema(
   {
     id: {
       type: String,
     },
     jobCategory: String,
     isdeleted: Number,
     comments: String,
   },
   { collection: "jobCategory", timestamps: true, versionKey: false }
 );

const JobCategory = model("jobCategory", jobCategory);
module.exports = JobCategory;
