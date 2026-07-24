const mongoose = require("mongoose");

const Schema = mongoose.Schema;
const model = mongoose.model;

const orderofpayments = new Schema(
  {
    id: {
      type: String,
    },
    tax: String,
    TotalAmount: Number,
    pincode: String,
    address: String,
    Company: String,
    lastname: String,
    firstname: String,
    city: String,
    email: String,
    state: String,
    paymentId: String,
    redirectUrl: String,
    gst: String,
    callbackUrl: String,
    merchantTransactionId: String,
    name: String,
    planId: String,
    paymentMethod: String,
    pannumber: String,
    price: String,
    agencyId: String,
    merchantUserId: String,
    paymentInstrument: Object,
    redirectMode: String,
    mobileNumber: String,
    servertoserverRes: Object,
    paymentcreateresponce: Object,
    invoicenumber: Number,
    subscriptionId: String,
  },
  { collection: "orderofpayments", timestamps: true, versionKey: false }
);

const Orderofpayments = model("orderofpayments", orderofpayments);

module.exports = Orderofpayments;
