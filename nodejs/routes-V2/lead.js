const router = require("express").Router();
const { verifyAuth } = require("../middleware/auth");

const {
  createLead,
  getLead,
  deleteLead,
  createClientsCrenditialApproved,
} = require("../controllerV2/lead");

// done
router.post("/lead/create", createLead);
router.post("/lead", verifyAuth, getLead);
router.delete("/lead/delete/:id", verifyAuth, deleteLead);
router.post("/lead/approve/:id", verifyAuth, createClientsCrenditialApproved);

// router.post("/lead/create", createLead);
// router.post("/lead", getLead);
// router.delete("/lead/delete/:id", deleteLead);
// router.post("/lead/approve/:id", createClientsCrenditialApproved);

module.exports = router;
