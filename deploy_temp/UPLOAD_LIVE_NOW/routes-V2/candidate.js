const express = require("express");

const router = express.Router();

const { verifyAuth } = require("../middleware/auth");
try {
  require("../middleware/subsciptionDaysCount");
} catch (e) {
  console.error("subsciptionDaysCount load skipped:", e.message);
}

let candidateCtrl = {};
try {
  candidateCtrl = require("../controllerV2/candidate");
} catch (e) {
  console.error("CRITICAL: controllerV2/candidate failed to load:", e.message);
}

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
  getPublicCandidateForApply,
  changeCandidatesDataSructure,
  getallcandidates,
  BestMatchClientCandidates,
  getCandidateSelfStatistics,
  candidateJobMatching,
  getSingleCandidateDetails,
  parseResume,
  publicParseResume,
  getResumeExtractionConfigStatus,
} = candidateCtrl;

const notReady =
  (name) =>
  (req, res) =>
    res.status(503).json({
      msg: `Candidate API unavailable (${name}). Check server logs for controller load errors.`,
    });

let SavedCandidate;
let toggleFavoriteCandidate;
try {
  const saved = require("../controllerV2/saved_Candidates");
  SavedCandidate = saved.SavedCandidate;
  toggleFavoriteCandidate = saved.toggleFavoriteCandidate;
} catch (e) {
  console.error("saved_Candidates load error:", e.message);
}

router.post("/candidate/create", verifyAuth, createCandidates || notReady("create"));
router.post("/candidate/create/csv", createCandidatesCsvFile || notReady("create/csv"));
router.post("/candidate/check", checkCandidate || notReady("check"));
if (typeof getPublicCandidateForApply === "function") {
  router.get("/candidate/public-apply/:id", getPublicCandidateForApply);
}
router.put("/candidate/update", verifyAuth, candidateUpdate || notReady("update"));
router.delete("/candidate/delete/:id", verifyAuth, deleteCandidate || notReady("delete"));
router.post("/candidates", verifyAuth, getCandidates || notReady("getCandidates"));
router.post("/candidate/view/:id", verifyAuth, candidateView || notReady("view"));
router.post("/candidate/hired", verifyAuth, hiredCandidateforClients || notReady("hired"));
router.post("/candidate/mail", verifyAuth, sendBulkMailToCandidates || notReady("mail"));
router.post("/clients/candidates", verifyAuth, getClientCandidates || notReady("clients"));
router.post(
  "/clients/bestmatchcandidate",
  verifyAuth,
  BestMatchClientCandidates || notReady("bestmatch")
);
router.post(
  "/candidates/changedata",
  changeCandidatesDataSructure || notReady("changedata")
);
router.post("/candidate/jobmatching", verifyAuth, candidateJobMatching || notReady("jobmatching"));
router.get("/candidate/profile", verifyAuth, getSingleCandidateDetails || notReady("profile"));
router.get(
  "/candidate/resume-extraction-status",
  verifyAuth,
  getResumeExtractionConfigStatus || notReady("resume-status")
);
router.get(
  "/candidate/public-resume-extraction-status",
  getResumeExtractionConfigStatus || notReady("public-resume-status")
);
router.post("/candidate/parse-resume", verifyAuth, parseResume || notReady("parse-resume"));
router.post("/candidate/parseResume", verifyAuth, parseResume || notReady("parseResume"));
//public Routes
router.post("/candidate/publicCreate", createCandidates || notReady("publicCreate"));
router.post("/candidate/publicParseResume", publicParseResume || notReady("publicParseResume"));
router.post("/candidate/public-parse-resume", publicParseResume || notReady("public-parse-resume"));
router.post(
  "/candidate/savedcandidate",
  verifyAuth,
  SavedCandidate || notReady("savedcandidate")
);
if (typeof toggleFavoriteCandidate === "function") {
  router.post("/candidate/toggle-favorite", verifyAuth, toggleFavoriteCandidate);
  router.post("/candidate/favorite", verifyAuth, toggleFavoriteCandidate);
}
router.get(
  "/candidate/statistics",
  verifyAuth,
  getCandidateSelfStatistics || notReady("statistics")
);

module.exports = router;
