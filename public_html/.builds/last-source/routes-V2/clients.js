const express = require("express");
const router = express.Router();
const { verifyAuth } = require("../middleware/auth");

const {
  createClients,
  updateClients,
  deleteClients,
  getClients,
  createClientsCrenditialApproved,
  clientsDeclined,
  getClientIdWise,
  getclientJobCategories,
  sendInterViewRequest,
  whatsappNotificationStatus,
  mailNotificationStatus,
} = require("../controllerV2/clients");
const { daysCountMiddleware } = require("../middleware/subsciptionDaysCount");
const { getAllClients } = require("../controllerV2/clients");
// const { sendInterviewRequest } = require("../middleware/Emails/email");

router.post("/clients/create",  createClients);
router.post("/clients/public", createClients);
router.post("/clients", verifyAuth, getClients); //verifyAuth
router.get("/clients/all", verifyAuth, getAllClients);
router.put("/clients/update/:id", verifyAuth, updateClients);
router.delete("/clients/delete/:id", verifyAuth, deleteClients);
router.post("/clients/interview/request", verifyAuth, sendInterViewRequest);
router.put("/clients/action/declined", verifyAuth, clientsDeclined);
router.get("/clients/jobcategories", verifyAuth, getclientJobCategories);
router.put(
  "/clients/whatsappNotification",
  verifyAuth,
  whatsappNotificationStatus
);
router.put("/clients/mailNotification", verifyAuth, mailNotificationStatus);

// not done
router.put(
  "/clients/action/approved",
  verifyAuth,
  createClientsCrenditialApproved
);

module.exports = router;
