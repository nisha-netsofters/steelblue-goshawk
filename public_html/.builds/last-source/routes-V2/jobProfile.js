const router = require("express").Router();

const {
  createJobProfile,
  updateJobProfile,
  getJobProfile,
  deleteJobProfile,
} = require("../controllerV2/jobProfile");
const { verifyAuth } = require("../middleware/auth");

// Done, checked it on postman but I want unable to find frontend so couldn't able to test from frontend

router.post("/jobProfile/create", verifyAuth, createJobProfile);
router.put("/jobProfile/update/:id", verifyAuth, updateJobProfile);
router.delete("/jobProfile/delete/:id", verifyAuth, deleteJobProfile);
router.post("/jobProfiles", verifyAuth, getJobProfile);

module.exports = router;
