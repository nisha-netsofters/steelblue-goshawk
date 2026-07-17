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
  getAllClients,
  getClientIdWise,
  getclientJobCategories,
  sendInterViewRequest,
  whatsappNotificationStatus,
  mailNotificationStatus,
} = require("../controllers/clients");
const { daysCountMiddleware } = require("../middleware/subsciptionDaysCount");
// const { sendInterviewRequest } = require("../middleware/Emails/email");

router.post("/clients/create", verifyAuth, createClients);
router.post("/clients/public", createClients);
router.post("/clients", verifyAuth, getClients);
router.get("/clients/all", verifyAuth, getAllClients);
router.put("/clients/update/:id", verifyAuth, updateClients);
router.delete("/clients/delete/:id", verifyAuth, deleteClients);
router.put(
  "/clients/action/approved",
  verifyAuth,
  createClientsCrenditialApproved
);
router.post("/clients/interview/request", sendInterViewRequest);
router.put("/clients/action/declined", clientsDeclined);
router.get("/clients/jobcategories", getclientJobCategories);
router.put("/clients/whatsappNotification",verifyAuth, whatsappNotificationStatus);
router.put("/clients/mailNotification",verifyAuth, mailNotificationStatus);

module.exports = router;
