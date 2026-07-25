const Plans = require("../models/Plan");
const Subscriptions = require("../models/Subscriptions");
const User = require("../models/User");
const jwt = require("jsonwebtoken");

exports.loginUser = async (req, res) => {
  var { email, password } = req.body;
const userDetail = await User.query()
  .findOne({
    email,
    password,
  })
  .withGraphFetched("role");
await User.query()
  .findOne({
    email,
    password,
  })
  .withGraphFetched("role")
  .withGraphFetched("clients.industries_relation.industries")
  .withGraphFetched("clients.jobCategory_relation.jobCategory")
  .withGraphFetched("clients.jobCategories")
  .withGraphFetched("subscription.plan.planFeature")
  // .withGraphFetched("plans")
  .then(async (result) => {
    if (result !== undefined) {
      const daysCount = daysCountMiddleware(result?.subscription);
      if (
        daysCount !== null &&
        daysCount == false &&
        daysCount != 0 &&
        result?.subscription?.plan?.planName != undefined &&
        result?.subscription?.plan?.planName != "free"
      ) {
        const getFreeplanData = await Plans.query()
          .withGraphFetched("planFeature")
          .findOne("planName", "free");
        const subscription = await Subscriptions.query().insertAndFetch({
          userId: result.clients.userId,
          planId: getFreeplanData.id,
          resume_download_count: 5,
        });
        await User.query()
          .update({ subscriptionId: subscription?.id })
          .where("id", result?.clients?.userId);
        res.json({ msg: "Please Update Your Plan" });
      } else {
        jwt.sign(
          { userDetail },
          process.env.SECRET,
          { expiresIn: process.env.EXPIRES_IN },
          (err, token) => {
            res.json({
              token,
              user: result,
            });
          }
        );
      }
    } else {
      res.json({
        msg: "user is not valid",
      });
    }
  })
  .catch((err) => console.log("login", err));
};

exports.VerifyToken = async (req, res) => {
  const { token } = req.query;
  let expired = false;
  jwt.verify(token, process.env.SECRET, (err, authdata) => {
    if (err) {
      console.log("invalid token or expired token");
      expired = true;
      // res.json({ msg: 'invalid token or expired token' })
    }
  });

  res.json({ expired });
};

exports.refreshToken = async (req, res) => {
  var { email, password } = req.body;

  await User.findOne({
    where: { email, password },
  })
    .then((result) => {
      if (result) {
        jwt.sign(
          { result },
          process.env.SECRET,
          { expiresIn: process.env.RE_EXPIRES_IN },
          (err, token) => {
            res.json({
              token,
              user: result,
            });
          }
        );
      } else {
        res.json({
          msg: "user is not valid",
        });
      }
    })
    .catch((err) => console.log("login user", err));
};

const daysCountMiddleware = (req, res, next) => {
  const subscriptionTime = req?.timeDuration;
  //  const subscriptionTime = null;
  if (subscriptionTime == null) {
    return null;
  }

  const subscriptionDate = req?.created_at;

  const startDate = new Date(subscriptionDate);
  // const startDate = new Date('2023-10-12T10:04:09.934Z');

  const today = new Date();

  const diffInMs = today - startDate;

  const daysCount = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

  if (subscriptionTime >= daysCount) {
    return daysCount;
  } else {
    return false;
  }
};
