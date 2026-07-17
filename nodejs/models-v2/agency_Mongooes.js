const mongoose = require("mongoose");

const Schema = mongoose.Schema;
const model = mongoose.model;

const agencySchema = new Schema(
  {
    id: { type: String, index: true },
    name: String,
    email: { type: String, index: true },
    password: String,
    exprireDate: Date,
    expirable: Boolean,
    sentmail: {
      type: Boolean,
      default: false,
    },
    mobileNumber: String,
    phoneNumber: String,
    ownersName: String,
    address: String,
    city: String,
    cityId: String,
    state: String,
    stateId: String,
    firstmail: {
      type: Boolean,
      default: false,
    },
    slug: String,
    country: {
      type: String,
      default: "India",
    },
    countryId: {
      type: String,
      default: "IN",
    },
    logo: String,
    bannerImage: String,
    themecolor: String,
    months: String,
    whatsapp: String,
    whatsappLink: String,
    gstNo: String,
    pancardNo: String,
    cinNumber: String,
    permission: {
      dataMerge: Object,
      areas: Array,
    },
    agencyCode: Number,
    isDownloadAble: {
      type: Boolean,
      default: false,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  {
    collection: "agency",
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
    timestamps: true,
    versionKey: false,
  }
);

const Agency = model("agency", agencySchema);
module.exports = Agency;
