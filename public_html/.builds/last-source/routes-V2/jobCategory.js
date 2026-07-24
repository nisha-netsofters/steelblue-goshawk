const router = require("express").Router();

const {
  getjobCategories,
  deleteJobCategory,
  createJobCategory,
  getAllJobCategories,
  updateJobCategory,
} = require("../controllerV2/jobCategory");

const { verifyAuth } = require("../middleware/auth");

router.post("/jobCategories", verifyAuth, getjobCategories);
router.post("/jobCategory/all", getAllJobCategories);
router.post("/jobCategory/create", verifyAuth, createJobCategory);
router.put("/jobCategory/update/:id", verifyAuth, updateJobCategory);
router.delete("/jobCategory/delete/:id", verifyAuth, deleteJobCategory);

module.exports = router;
