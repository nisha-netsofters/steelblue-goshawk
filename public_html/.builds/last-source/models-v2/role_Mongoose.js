const mongoose = require("mongoose");

const Schema = mongoose.Schema;
const model = mongoose.model;

const roleSchema = new Schema(
  {
    id: {
      type: String,
    },
    name: String,
  },
  {
    collection: "role",
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
    timestamps: true,
    versionKey: false,
  }
);

const Role = model("role", roleSchema);
module.exports = Role;
