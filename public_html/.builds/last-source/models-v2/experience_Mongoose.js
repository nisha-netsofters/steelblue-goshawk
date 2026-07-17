
const mongoose = require("mongoose");

const Schema = mongoose.Schema;
const model = mongoose.model;

 const experience = new Schema(
   {
     id: {
       type: String,
     },
     candidateId: String,
     occupation: String,
     workduration: String,
     summary: String,
     companyName: String,
     companyMobile: String,
     companyAddress: String,
     agencyId:String,
     companyLink: String,
   },
   { collection: "experience", versionKey: false, timestamps: true  }
 );

 const Experience = model("experience", experience);
module.exports = Experience
