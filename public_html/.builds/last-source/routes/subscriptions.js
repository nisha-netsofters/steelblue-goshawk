const route = require("express").Router();
const {
  getAllSubscriptions,
  createSubscription,
  createFreeSubscriptionForAllClients,
  decreaseResumeDownloadFreeSubscription,
  getClientSubscription,
} = require("../controllers/subscriptions");

route.get("/subscriptions/all", getAllSubscriptions);
route.post("/subscriptions/create", createSubscription);
route.put(
  "/subscriptions/decrease-reseume-download",
  decreaseResumeDownloadFreeSubscription
);
route.post("/subscriptions/free", createFreeSubscriptionForAllClients);
route.get("/subscriptions", getClientSubscription);

module.exports = route;
