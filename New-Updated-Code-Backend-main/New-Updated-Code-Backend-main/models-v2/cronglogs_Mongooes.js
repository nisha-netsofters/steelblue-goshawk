const mongoose = require("mongoose");
const moment = require("moment");
const Schema = mongoose.Schema;
const model = mongoose.model;

const cronLogsSchema = new Schema(
  {
    id: {
      type: String,
    },
    cronStart: { type: Date, default: moment().toISOString() },
    cronEnd: { type: Date },
    type: { type: String, default: "whatsapp_notification" },
    sentMessages: { type: Number, default: 0 },
    metadata: { type: Object },
  },
  {
    collection: "cronlogs",
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
    timestamps: true,
    versionKey: false,
  }
);

const CronLogs = model("cronlogs", cronLogsSchema);
module.exports = CronLogs;
