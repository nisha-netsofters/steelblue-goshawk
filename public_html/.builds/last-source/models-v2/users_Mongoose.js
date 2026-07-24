const mongoose = require("mongoose");

const Schema = mongoose.Schema;
const model = mongoose.model;

const users = new Schema(
  {
    id: { type: String, index: true },
    name: String,
    email: {
      type: String,
      // unique: true,
    },
    password: String,
    mobile: {
      type: String,
      // unique: true,
      maxlength: 10,
      minlength: 10,
    },
    address: String,
    image: String,
    comments: String,
    roleId: { type: String, index: true },
    subscriptionId: {
      type: String,
      default: null,
    },
    paymentMethod: {
      type: String,
      default: null,
    },
    planId: String,
    cityId: String,
    stateId: String,
    city: String,
    state: String,
    agencyId: String,
    BillingDetails: Object,
    isBcrypt: {
      type: Boolean,
      default: false,
    },
  },
  {
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
    timestamps: true,
    versionKey: false,
  }
);

users.virtual("role", {
  ref: "role",
  localField: "roleId",
  foreignField: "id",
  justOne: true,
});

// users.virtual("users", {
//   ref: "role",
//   localField: "id",
//   foreignField: "roleId",
// });

const Users = model("Users", users);
module.exports = Users;
