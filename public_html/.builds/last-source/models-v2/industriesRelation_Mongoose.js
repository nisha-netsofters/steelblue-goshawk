const mongoose = require("mongoose");

const Schema = mongoose.Schema;
const model = mongoose.model;

const industriesRelation = new Schema(
  {
    id: {
      type: mongoose.Schema.Types.ObjectId,
    },
    cId: String,
    industriesId: String,
  },
  { collection: "industriesRelation", timestamps: true, versionKey: false }
);

const IndustriesRelation = model("industriesRelation", industriesRelation);
module.exports = IndustriesRelation;