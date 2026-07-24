const express = require("express");

const { daysCountMiddleware } = require("../middleware/subsciptionDaysCount");
const {
  loginUser,
  refreshToken,
  VerifyToken,
  verifyemail,
} = require("../controllerV2/auth");

const router = express.Router();

router.post("/user/login", loginUser);
router.post("/user/check/token", daysCountMiddleware, VerifyToken);
router.post("/user/refresh_token", refreshToken);
router.post("/user/verifyemail", verifyemail);

module.exports = router;
