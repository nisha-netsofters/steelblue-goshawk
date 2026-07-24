const route = require("express").Router();

const {
  getAllPayments,
  createRazorpayOrder,
  capturePayment,
  webHookPayment,
  webHookOrder,
  paymentMail,
} = require("../controllerV2/payments");
const {
  paymentCreate,
  paymentStatus,
  serverToServerCall,
  getOrderDetails,
} = require("../controllerV2/paymentsNew");
const { verifyAuth } = require("../middleware/auth");

route.get("/payments", getAllPayments);
route.post("/create/orderInstance", verifyAuth, createRazorpayOrder);
route.post("/capture", verifyAuth, capturePayment);
route.post("/webhook/payment", verifyAuth, webHookPayment);
route.post("/webhook/order", verifyAuth, webHookOrder);
route.post("/payment/paymentMail/:id", verifyAuth, paymentMail);

route.post("/payment/create", verifyAuth, paymentCreate);
route.post("/payment/Status", paymentStatus);
route.post("/servertoserver", serverToServerCall);
route.post("/payment/details", getOrderDetails);

module.exports = route;
