const mongoose = require("mongoose");

const Schema = mongoose.Schema;
const model = mongoose.model;

 const onBoarding = new Schema(
   {
     id: {
       type: String,
     },
     userId: { type: String, index: true },
     industriesId: String,
     companyName: String,
     companyOwner: String,
     companyContactNo: String,
     companyEmail: String,
     agencyId:{ type: String, index: true },
     companyStreetAddress: String,
     companyCity: String,
     companyState: String,
     companyPincode: String,
     companyWebsite: String,
     companyMapUrl: String,
     jobCategoryId: String,
     numberOfVacancy: String,
     jobStartTime: String,
     jobEndTime: String,
     sunday: String,
     minExperienceYears: String,
     qualification: String,
     field: String,
     course: String,
     designation: String,
     salaryRangeStart: { type: Number, default: 0 },
     salaryRangeEnd: { type: Number, default: 0 },
     negotiable: String,
     jobLocation: String,
     basicSkill: String,
     keyRole: String,
     workingDays: { type: Number, default: 5 },
     plSlCl: { type: Number, default: 0 },
     healthPolicy: String,
     pfEsic: { type: Number, default: 0 },
     other: String,
     jobDescriptionFile: String,
     status: String,
     isdeleted: { type: Number, default: 0 },
     gender: String,
     workType: String,
   },
   { collection: "onBoarding", timestamps: true, versionKey: false }
 );

const OnBoarding = model("onBoarding", onBoarding);
module.exports = OnBoarding;
