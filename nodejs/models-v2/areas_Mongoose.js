const mongoose = require("mongoose");

const Schema = mongoose.Schema;
const model = mongoose.model;

const areaSchema = new Schema(
  {
    id: { type: String, index: true },
    name: { type: String, required: true, index: true },
    city: { type: String, required: true, index: true },
    state: { type: String, required: true, index: true },
    isActive: { type: Boolean, default: true },
  },
  { collection: "areas", timestamps: true, versionKey: false }
);

areaSchema.index({ state: 1, city: 1, name: 1 }, { unique: true });

const Area = model("areas", areaSchema);
module.exports = Area;
