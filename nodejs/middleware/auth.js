const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");

exports.verifyAuth = async (req, res, next) => {
  const token = req.headers["token"];
  jwt.verify(token, process.env.SECRET, (err, authdata) => {
    if (err) {
      res.json({ msg: "invalid token or expired token" });
      console.log("invalid token or expired token");
    } else {
      req.user = authdata?.userDetail;
      next();
    }
  });
};
exports.forgotPasswordVerifyToken = async (req, res, next) => {
  const { token } = req.query;

  jwt.verify(token, process.env.SECRET, (err, authdata) => {
    if (err) {
      res.json({ msg: "invalid_token" });
      // console.log('invalid token or expired token forgot Password')
    } else {
      next();
    }
  });
};
