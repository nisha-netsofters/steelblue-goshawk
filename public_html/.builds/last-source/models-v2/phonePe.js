const mongoose = require("mongoose");

const Schema = mongoose.Schema;
const model = mongoose.model;

const phonePeSchema = new Schema(
  {
    phonePe: { type: Schema.Types.Mixed },
  },
  {
    collection: "phonePe",
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
    timestamps: true,
    versionKey: false,
  }
);

const PhonePe = model("phonePe", phonePeSchema);
module.exports = PhonePe;
