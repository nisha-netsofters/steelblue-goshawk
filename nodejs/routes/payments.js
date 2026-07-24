const route = require("express").Router();

const {
  getAllPayments,
  createRazorpayOrder,
  capturePayment,
  webHookPayment,
  webHookOrder,
  paymentMail,
} = require("../controllers/payments");
const { verifyAuth } = require("../middleware/auth");

route.get("/payments", getAllPayments);
route.post("/create/orderInstance", verifyAuth, createRazorpayOrder);
route.post("/capture", verifyAuth, capturePayment);
route.post("/webhook/payment", webHookPayment);
route.post("/webhook/order", webHookOrder);
route.post("/payment/paymentMail/:id", verifyAuth, paymentMail);

module.exports = route;
