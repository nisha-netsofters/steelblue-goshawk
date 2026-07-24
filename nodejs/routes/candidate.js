const express = require("express");

const router = express.Router();

const {
  createCandidates,
  getCandidates,
  deleteCandidate,
  candidateUpdate,
  candidateView,
  createCandidatesCsvFile,
  checkCandidate,
  hiredCandidateforClients,
  sendBulkMailToCandidates,
  getClientCandidates,
} = require("../controllers/candidate");
const { verifyAuth } = require("../middleware/auth");
const { daysCountMiddleware } = require("../middleware/subsciptionDaysCount");

router.post("/candidate/create", verifyAuth, createCandidates);
router.post("/candidate/create/csv", createCandidatesCsvFile);
router.post("/candidate/check", checkCandidate);
router.put("/candidate/update", verifyAuth, candidateUpdate);
router.delete("/candidate/delete/:id", verifyAuth, deleteCandidate);
router.post("/candidates", verifyAuth, getCandidates);
router.post("/candidate/view/:id", verifyAuth, candidateView);
router.post("/candidate/hired", verifyAuth, hiredCandidateforClients);
router.post("/candidate/mail", verifyAuth, sendBulkMailToCandidates);
router?.post("/clients/candidates",daysCountMiddleware, getClientCandidates);

//public Routes
router.post("/candidate/publicCreate", createCandidates);

module.exports = router;
