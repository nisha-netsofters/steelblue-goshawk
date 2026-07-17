const mongoose = require("mongoose");

const Schema = mongoose.Schema;
const model = mongoose.model;

const planFeatures = new Schema(
  {
    //   id: {
    //     type: String,
    //   },
    //   validateDays: String,
    //   resumeDownloadCount: {type:String,default:5},
    //   interviewCount: {type:String,default:"-1"},
    //   upgradeProfileTop: {type:Boolean,default:false},
    //   exportCandidateLists: {type:Boolean,default:false},
    //   mailNotification: {type:Boolean,default:false},
    //   whatsappNotification: {type:Boolean,default:false},
    id: String,
    validate_days: String,
    resume_download_count: String,
    interview_count: String,
    upgrade_profile_top: Boolean,
    export_candidate_lists: Boolean,
    mail_notification: Boolean,
    whatsapp_notification: Boolean,
  },
  { collection: "plan_features", timestamps: true, versionKey: false }
);

const PlanFeatures = model("planFeatures", planFeatures);
module.exports = PlanFeatures;
