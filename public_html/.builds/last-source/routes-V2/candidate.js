const express = require("express");

const router = express.Router();

const { verifyAuth } = require("../middleware/auth");
const { daysCountMiddleware } = require("../middleware/subsciptionDaysCount");
const {
  createCandidatesCsvFile,
  hiredCandidateforClients,
  sendBulkMailToCandidates,
  getClientCandidates,
  getCandidates,
  createCandidates,
  deleteCandidate,
  candidateUpdate,
  candidateView,
  checkCandidate,
  changeCandidatesDataSructure,
  getallcandidates,
  BestMatchClientCandidates,
  getCandidateSelfStatistics,
  candidateJobMatching,
  getSingleCandidateDetails,
} = require("../controllerV2/candidate");
const { SavedCandidate } = require("../controllerV2/saved_Candidates");

router.post("/candidate/create", verifyAuth, createCandidates);
router.post("/candidate/create/csv", createCandidatesCsvFile);
router.post("/candidate/check", checkCandidate);
router.put("/candidate/update", verifyAuth, candidateUpdate);
router.delete("/candidate/delete/:id", verifyAuth, deleteCandidate);
router.post("/candidates", verifyAuth, getCandidates);
router.post("/candidate/view/:id", verifyAuth, candidateView);
router.post("/candidate/hired", verifyAuth, hiredCandidateforClients);
router.post("/candidate/mail", verifyAuth, sendBulkMailToCandidates);
router?.post("/clients/candidates", verifyAuth, getClientCandidates);
router?.post(
  "/clients/bestmatchcandidate",
  verifyAuth,
  BestMatchClientCandidates
);
router?.post(
  "/candidates/changedata",
  // verifyAuth,
  changeCandidatesDataSructure
);
router.post("/candidate/jobmatching", verifyAuth, candidateJobMatching);
router.get("/candidate/profile", verifyAuth, getSingleCandidateDetails);
//public Routes
router.post("/candidate/publicCreate", createCandidates);
router.post("/candidate/savedcandidate", verifyAuth, SavedCandidate);
router.get(
  "/candidate/statistics",
  verifyAuth,
  getCandidateSelfStatistics
);

module.exports = router;
