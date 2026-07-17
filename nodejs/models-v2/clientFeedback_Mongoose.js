const mongoose = require("mongoose");

const Schema = mongoose.Schema;
const model = mongoose.model;

 const clientFeedback = new Schema(
   {
     id: {
       type: String,
     },
     onBoardingId: String,
     feedback: String,
     isdeleted: { type: Number, default: 0 },
     agencyId: String,
   },
   { collection: "clientFeedback", timestamps: true, versionKey: false }
 );

 const ClientFeedback = model("clientFeedback", clientFeedback);

 module.exports = ClientFeedback;