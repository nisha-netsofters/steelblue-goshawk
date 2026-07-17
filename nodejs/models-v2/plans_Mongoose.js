const mongoose = require("mongoose");

const Schema = mongoose.Schema;
const model = mongoose.model;

const plans = new Schema(
  {
    plan_feature_id: String,
    planName: String,
    price: String,
    created_at: String,
    id: {
      type: String,
    },
    // planFeatureId: {
    //   type: String,
    //   require: true,
    // },
    // planName: {
    //   type: String,
    //   require: true,
    // },
    // price: String,
  },
  { collection: "plans", timestamps: true, versionKey: false }
);

const Plans = model("plans", plans);

module.exports = Plans;
