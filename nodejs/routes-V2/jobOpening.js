const router = require("express").Router();
const {
  createJobOpening,
  updateJobOpening,
  deleteJobOpening,
  getOnJobOpening,
  findJobOpening,
  bestMatchCandidate,
  hotvacancy,
  ActivateAgainJobopening,
  applyForJob,
  getJobApplicants,
  generateJobDescriptionAi,
  updateJobPostingStatus,
  assignJobRecruiter,
} = require("../controllerV2/jobOpening");

const { verifyAuth } = require("../middleware/auth");
router.post("/jobOpening/create", verifyAuth, createJobOpening);
router.get("/jobOpening/find", verifyAuth, findJobOpening);
router.put(
  "/jobOpening/:id/posting-status",
  verifyAuth,
  updateJobPostingStatus
);
router.put(
  "/jobOpening/:id/assign-recruiter",
  verifyAuth,
  assignJobRecruiter
);
router.put("/jobOpening/:id", verifyAuth, updateJobOpening);
router.delete("/jobOpening/:id", verifyAuth, deleteJobOpening);
router.post("/jobOpenings", verifyAuth, getOnJobOpening);
router.post(
  "/jobOpening/generate-description",
  verifyAuth,
  generateJobDescriptionAi
);
router.post(
  "/jobOpening/bestmatchcandidate/:id",
  verifyAuth,
  bestMatchCandidate
);
router.post("/jobOpening/hotvacancy", verifyAuth, hotvacancy);
router.get("/jobOpening/activateagain", verifyAuth, ActivateAgainJobopening);
router.post("/job/apply", verifyAuth, applyForJob);
router.get("/job/:jobOpeningId/applicants", verifyAuth, getJobApplicants);

module.exports = router;
