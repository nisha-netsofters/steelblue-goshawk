const mongoose = require("mongoose");

const Schema = mongoose.Schema;
const model = mongoose.model;

const welcomeWhatsappLog = new Schema(
  {
    id: String,
    candidateId: String,
    mobile: String,
    apiId: String,
    apiName: String,
    status: {
      type: String,
      enum: ["success", "failed", "skipped"],
      default: "failed",
    },
    requestPayload: Schema.Types.Mixed,
    response: Schema.Types.Mixed,
    error: String,
  },
  { collection: "welcomeWhatsappLogs", timestamps: true, versionKey: false }
);

const WelcomeWhatsappLog = model("welcomeWhatsappLogs", welcomeWhatsappLog);

module.exports = WelcomeWhatsappLog;
