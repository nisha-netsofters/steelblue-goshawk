const mongoose = require("mongoose");

const Schema = mongoose.Schema;
const model = mongoose.model;

 const jobCategoryRelation = new Schema(
   {
     id: {
       type: String,
     },
     cId: String,
     jobCategoryId: String,
   },
   { collection: "jobCategoryRelation", timestamps: true, versionKey: false }
 );

const JobCategory_Relation = model("jobCategoryRelation", jobCategoryRelation);

module.exports = JobCategory_Relation;
