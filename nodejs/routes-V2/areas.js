const router = require("express").Router();
const {
  getAreas,
  getAreasList,
  createArea,
  updateArea,
  deleteArea,
} = require("../controllerV2/areas");
const { verifyAuth } = require("../middleware/auth");

// Candidate dropdown (existing)
router.get("/areas", verifyAuth, getAreas);
router.post("/areas", verifyAuth, getAreas);

// Super Admin CRUD
router.post("/areas/list", verifyAuth, getAreasList);
router.post("/areas/create", verifyAuth, createArea);
router.put("/areas/update/:id", verifyAuth, updateArea);
router.delete("/areas/delete/:id", verifyAuth, deleteArea);

module.exports = router;
