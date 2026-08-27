const router = require("express").Router();
const {
  getEducations,
  getCourses,
  getEducationList,
  createEducation,
  updateEducation,
  deleteEducation,
  getCourseList,
  createCourse,
  updateCourse,
  deleteCourse,
} = require("../controllerV2/education");
const { verifyAuth } = require("../middleware/auth");

router.get("/education", getEducations);
router.post("/education", getEducations);
router.get("/courses", getCourses);
router.post("/courses", getCourses);

router.post("/education/list", verifyAuth, getEducationList);
router.post("/education/create", verifyAuth, createEducation);
router.put("/education/update/:id", verifyAuth, updateEducation);
router.delete("/education/delete/:id", verifyAuth, deleteEducation);

router.post("/courses/list", verifyAuth, getCourseList);
router.post("/courses/create", verifyAuth, createCourse);
router.put("/courses/update/:id", verifyAuth, updateCourse);
router.delete("/courses/delete/:id", verifyAuth, deleteCourse);

module.exports = router;
