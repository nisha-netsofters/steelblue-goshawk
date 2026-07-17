const express = require("express");
const {
  loginUser,
  refreshToken,
  VerifyToken,
  createUser,
  agencyDashboard,
  agencyCount,
  agencyDashboardList,
  transactionlist,
} = require("../controllerV2/superAdmin");
const {
  createAgency,
  getAgency,
  updateAgency,
  deleteAgency,
  getAgencyViaSlug,
  getCandidateForAgency,
  updateAgencyActive,
  getAgencyViaSlugPublic,
  AgencyValidityUpdate,
  sendMailforAgencyDeactivation,
  removeExpiredNames,
} = require("../controllerV2/agency");
const { verifyAuth } = require("../middleware/auth");
const {
  sendMailforAgencyDeactivationformiddleware,
  removeExpiredNamesformiddleware,
} = require("../middleware/agency");

const router = express.Router();

router.post("/superAdmin/login", loginUser);
router.post("/superAdmin/check/token", VerifyToken);
router.post("/superAdmin/refresh_token", refreshToken);
router.post("/superAdmin/createUser", createUser);
router.post("/superAdmin/agency", createAgency);
router.post(
  "/superAdmin/searchAgency",
  verifyAuth,
  removeExpiredNamesformiddleware,
  sendMailforAgencyDeactivationformiddleware,
  getAgency
);

router.put("/superAdmin/agency", verifyAuth, updateAgency);
router.put("/superAdmin/deleteAgency", verifyAuth, deleteAgency);
router.get("/agency/:slug", verifyAuth, getAgencyViaSlug);
router.get("/agencypublic/:slug", getAgencyViaSlugPublic);
router.post("/agency/candidate", verifyAuth, getCandidateForAgency);
router.post("/agency/active/:id", verifyAuth, updateAgencyActive);
router.get("/superAdmin/agencycount", verifyAuth, agencyCount);
router.get("/superAdmin/agencyDashboard", verifyAuth, agencyDashboard);
router.post("/superAdmin/agencylist", verifyAuth, agencyDashboardList);
router.post("/superAdmin/updatevalidity", verifyAuth, AgencyValidityUpdate);
router.get("/superAdmin/updatefunction", removeExpiredNames);
router.post("/superAdmin/transactionlist", verifyAuth, transactionlist);
router.get(
  "/superAdmin/mailforagencydeactivation",
  sendMailforAgencyDeactivation
);

module.exports = router;
