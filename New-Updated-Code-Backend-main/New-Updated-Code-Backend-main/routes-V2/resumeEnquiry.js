const router = require("express").Router();
const { verifyAuth } = require("../middleware/auth");

const {
  createResumeEnquiry,
  getResumeEnquiries,
  getResumeEnquiryView,
  updateResumeEnquiryStatus,
  getResumeEnquiryStatus,
} = require("../controllerV2/resumeEnquiry");

router.post("/resume-enquiry/create", verifyAuth, createResumeEnquiry);
router.post("/resume-enquiry", verifyAuth, getResumeEnquiries);
router.get("/resume-enquiry/getById/:id", verifyAuth, getResumeEnquiryView);
router.put("/resume-enquiry/statusUpdate", verifyAuth, updateResumeEnquiryStatus);
router.get("/resume-enquiry/getStatusByUserId/:userId", verifyAuth, getResumeEnquiryStatus);

module.exports = router;
