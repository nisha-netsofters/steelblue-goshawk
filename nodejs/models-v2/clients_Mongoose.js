const mongoose = require("mongoose");

const Schema = mongoose.Schema;
const model = mongoose.model;

const clients = new Schema(
  {
    id: String,
    companyName: String,
    companyowner: String,
    address: String,
    // bannerImage: String, 
    mobile: {
      type: String,
      maxlength: 10,
      minlength: 10,
    },
    email: String,
    city: String,
    state: String,
    industries_relation: [
      {
        id: String,
        _id: String,
        cId: String,
        createdAt: Date,
        industriesId: String,
        industries: {
          _id: String,
          id: String,
          comments: String,
          createdAt: Date,
          industryCategory: String,
          updatedAt: Date,
          agencyId: String,
        },
      },
    ],
    action: {
      type: String,
      default: "pending",
    },
    whatsappNotification: { type: Boolean, default: true },
    mailNotification: { type: Boolean, default: true },
    cityId: String,
    stateId: String,
    agencyId: String,
    createdAt: Date,
    updatedAt: Date,
    zip: String,
    userId: String,
    businessNature: String,
    street: String,
    jobCategory_relation: [
      {
        jobCategoryId: String,
        cId: String,
        _id: String,
        id: String,
        jobCategory: {
          _id: String,
          id: String,
          comments: String,
          createdAt: Date,
          isdeleted: Number,
          jobCategory: String,
          updatedAt: Date,
          agencyId: String,
        },
      },
    ],
  },
  {
    collection: "clients",
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
    timestamps: true,
    versionKey: false,
  }
);

const Clients = model("clients", clients);
module.exports = Clients;
