const { getRoles, getRoleById, createRole } = require("../controllerV2/role");
const { verifyAuth } = require("../middleware/auth");

const router = require("express").Router();

router.get("/roles", verifyAuth, getRoles);
router.get("/role/:id", verifyAuth, getRoleById);
router.post("/role/create", verifyAuth, createRole);

module.exports = router;
