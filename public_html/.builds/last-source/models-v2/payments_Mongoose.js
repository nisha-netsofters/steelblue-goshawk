const mongoose = require("mongoose");

const Schema = mongoose.Schema;
const model = mongoose.model;

 const payments = new Schema(
   {
     id: {
       type: String,
     },
     userId: String,
     paymentId: String,
     entity: String,
     amount: String,
     status: String,
     currency: String,
     orderId: String,
     invoiceId: String,
     agencyId: String,
     method: String,
     captured: String,
     cardId: String,
     email: String,
     contact: String,
     notes: String,
     fee: String,
     tax: String,
     errorCode: String,
     errorDescription: String,
     errorSource: String,
     errorStep: String,
     errorReason: String,

     customerId: String,
   },
   { collection: "payments", timestamps: true, versionKey: false }
 );

const Payments = model("payments", payments);

module.exports = Payments;
