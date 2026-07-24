const route = require("express").Router();
const {
  getAllSubscriptions,
  createSubscription,
  createFreeSubscriptionForAllClients,
  decreaseResumeDownloadFreeSubscription,
  getClientSubscription,
} = require("../controllerV2/subscriptions");
const { verifyAuth } = require("../middleware/auth");

route.get("/subscriptions/all", verifyAuth, getAllSubscriptions);
route.post("/subscriptions/create", verifyAuth, createSubscription);
route.put(
  "/subscriptions/decrease-reseume-download",
  decreaseResumeDownloadFreeSubscription
);
route.post("/subscriptions/free", createFreeSubscriptionForAllClients);
route.get("/subscriptions", getClientSubscription);

module.exports = route;
