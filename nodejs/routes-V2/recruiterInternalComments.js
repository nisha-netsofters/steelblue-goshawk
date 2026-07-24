const router = require("express").Router();
const { verifyAuth } = require("../middleware/auth");

const {
  createRecruiterInternalComment,
  getRecruiterInternalComments,
  updateRecruiterInternalComment,
  deleteRecruiterInternalComment,
} = require("../controllerV2/recruiterInternalComments");

router.post(
  "/recruiter-internal-comments/create",
  verifyAuth,
  createRecruiterInternalComment
);
router.post(
  "/recruiter-internal-comments",
  verifyAuth,
  getRecruiterInternalComments
);
router.put(
  "/recruiter-internal-comments/update/:id",
  verifyAuth,
  updateRecruiterInternalComment
);
router.delete(
  "/recruiter-internal-comments/delete/:id",
  verifyAuth,
  deleteRecruiterInternalComment
);

module.exports = router;
