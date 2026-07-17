const express = require("express");

const router = express.Router();

//controllers
const { verifyAuth, forgotPasswordVerifyToken } = require("../middleware/auth");
const {
  passwordUpdate,
  forgotPasswordEmailLink,
  resetPassword,
  detailsUser,
  createUser,
  userUpdate,
  userDelete,
  getUsersRoleWise,
  getUserData,
  getUsers,
  createFreeSubscription,
} = require("../controllerV2/user");

router.put("/user/password/:id", verifyAuth, passwordUpdate);
router.post("/user/forgot/password", forgotPasswordEmailLink);
router.post("/user/password/reset", forgotPasswordVerifyToken, resetPassword);
router.post("/user/create", verifyAuth, createUser);
router.delete("/user/delete/:id", verifyAuth, userDelete);
router.get("/user/with/role", verifyAuth, getUsersRoleWise);

//Pending
// -----------------------------------------------------------------------
router.put("/user/update/:id", verifyAuth, userUpdate);
// -----------------------------------------------------------------------
// done
router.get("/user/:id", verifyAuth, detailsUser);
// -----------------------------------------------------------------------

router.get("/getUserData/:id", verifyAuth, getUserData);
router.post("/users", verifyAuth, getUsers);
router.post("/freeSubscription/:id", verifyAuth, createFreeSubscription);
// router.post('/users/filter', filterUsers);

module.exports = router;
