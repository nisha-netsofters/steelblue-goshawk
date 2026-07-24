const jwt = require("jsonwebtoken");
const Users = require("../models-v2/users_Mongoose");
const Role = require("../models-v2/role_Mongoose");
const Agency = require("../models-v2/agency_Mongooes");
const { Plans } = require("../models-v2/plans_Mongoose");
const Subscription = require("../models-v2/subscriptions_Mongoose");
const { default: mongoose } = require("mongoose");
const bcrypt = require("bcryptjs");

exports.loginUser = async (req, res) => {
  const { email, password, agencyId } = req.body;
  let userDetail = await Users.aggregate([
    {
      $match: {
        email: email,
      },
    },
    {
      $match: {
        agencyId: agencyId,
      },
    },
    {
      $lookup: {
        from: "role",
        localField: "roleId",
        foreignField: "id",
        as: "role",
      },
    },
    {
      $addFields: {
        role: { $arrayElemAt: ["$role", 0] },
      },
    },
  ]);
  if (userDetail.length > 0) {
    userDetail = userDetail[0];
  }
  const userIsInAgency = await Agency.findOne({ email: email });
  let payload = [];
  if (!userIsInAgency) {
    payload.push({
      $project: {
        name: 1,
        email: 1,
        mobileNumber: 1,
        _id: 0,
        id: 1,
        state: 1,
        city: 1,
        country: 1,
        countryId: 1,
        logo: 1,
        bannerImage: 1,
        themecolor: 1,
        whatsapp: 1,
        permission: 1,
        isDeleted: 1,
        createdAt: 1,
        slug: 1,
        ownersName: 1,
        isDownloadAble: 1,
        // cinNumber: 1,
        // pancardNo: 1,
        // gstNo: 1,
      },
    });
  }
  const userWithoutPassword = await Users.aggregate([
    { $match: { email } },
    // { $project: { password: 0 } },
    {
      $project: {
        password: 1,
        isBcrypt: 1,

        // auth fields
        email: 1,
        id: 1,
        roleId: 1,
        agencyId: 1,
        subscriptionId: 1,

        // 🔑 display-safe identity fields (NON-SENSITIVE)
        name: 1,
        firstname: 1,
        lastname: 1,
        mobileNumber: "$mobile",
        image: 1
      }

    },
    {
      $match: { agencyId: agencyId },
    },
    {
      $lookup: {
        from: "clients",
        localField: "id",
        foreignField: "userId",
        as: "clients",
      },
    },
    {
      $lookup: {
        from: "role",
        localField: "roleId",
        foreignField: "id",
        as: "role",
      },
    },
    {
      $addFields: {
        role: { $arrayElemAt: ["$role", 0] },
      },
    },
    {
      $lookup: {
        from: "agency",
        localField: "agencyId",
        foreignField: "id",
        as: "agency",
        pipeline: [...payload],
      },
    },
    {
      $addFields: {
        clients: { $arrayElemAt: ["$clients", 0] },
        agency: { $arrayElemAt: ["$agency", 0] },
      },
    },
    { $project: { "agency.password": 0 } },
    {
      $lookup: {
        from: "subscriptions",
        localField: "subscriptionId",
        foreignField: "id",
        as: "subscription",
        pipeline: [
          {
            $lookup: {
              from: "plans",
              localField: "planId",
              foreignField: "id",
              as: "plan",
              pipeline: [
                {
                  $lookup: {
                    from: "plan_features",
                    localField: "plan_feature_id",
                    foreignField: "id",
                    as: "planFeature",
                  },
                },
                {
                  $addFields: {
                    planFeature: { $arrayElemAt: ["$planFeature", 0] },
                  },
                },
              ],
            },
          },
          {
            $addFields: {
              plan: { $arrayElemAt: ["$plan", 0] },
            },
          },
        ],
      },
    },
    {
      $addFields: {
        subscription: { $arrayElemAt: ["$subscription", 0] },
      },
    },
  ]);
  await Users.aggregate([
    { $match: { email } },
    // { $project: { password: 0 } },
    {
      $match: { agencyId: agencyId },
    },
    {
      $lookup: {
        from: "clients",
        localField: "id",
        foreignField: "userId",
        as: "clients",
      },
    },
    {
      $lookup: {
        from: "role",
        localField: "roleId",
        foreignField: "id",
        as: "role",
      },
    },
    {
      $addFields: {
        role: { $arrayElemAt: ["$role", 0] },
      },
    },
    {
      $lookup: {
        from: "agency",
        localField: "agencyId",
        foreignField: "id",
        as: "agency",
      },
    },
    {
      $addFields: {
        clients: { $arrayElemAt: ["$clients", 0] },
        agency: { $arrayElemAt: ["$agency", 0] },
      },
    },
    { $project: { "agency.password": 0 } },
    {
      $lookup: {
        from: "subscriptions",
        localField: "subscriptionId",
        foreignField: "id",
        as: "subscription",
        pipeline: [
          {
            $lookup: {
              from: "plans",
              localField: "planId",
              foreignField: "id",
              as: "plan",
              pipeline: [
                {
                  $lookup: {
                    from: "plan_features",
                    localField: "plan_feature_id",
                    foreignField: "id",
                    as: "planFeature",
                  },
                },
                {
                  $addFields: {
                    planFeature: { $arrayElemAt: ["$planFeature", 0] },
                  },
                },
              ],
            },
          },
          {
            $addFields: {
              plan: { $arrayElemAt: ["$plan", 0] },
            },
          },
        ],
      },
    },
    {
      $addFields: {
        subscription: { $arrayElemAt: ["$subscription", 0] },
      },
    },
  ])
    .then(async (result) => {
      let userData = result[0];
      if (result?.length > 0) {
        // Check if agency is active (except for Client role)
        if (
          userData?.agency?.isDeleted == true &&
          userDetail?.role?.name !== "Client"
        ) {
          return res.json({
            msg: "Your agency is not active",
          });
        }

        // Password verification supporting both hashed and plain-text (backward compatible)
        const isBcrypt = !!userData?.isBcrypt;
        let isPasswordValid = false;

        if (isBcrypt) {
          isPasswordValid = await bcrypt.compare(
            password || "",
            userData?.password || ""
          );
        } else {
          isPasswordValid = userData?.password === password;
        }

        if (!isPasswordValid) {
          return res.json({
            msg: "password is not valid",
          });
        }

          const daysCount = daysCountMiddleware(userData?.subscription);
          if (
            daysCount !== null &&
            daysCount == false &&
            daysCount != 0 &&
            userData?.subscription?.plan?.planName != undefined &&
            userData?.subscription?.plan?.planName != "free"
          ) {
            const getFreeplanData = await Plans.findOne({ planName: "free" });
            const objectid = new mongoose.Types.ObjectId();
            const subscription = await Subscription.create({
              _id: objectid,
              id: objectid,
              userId: userData.clients.userId,
              planId: getFreeplanData.id,
              resume_download_count: 5,
            });
            await Users.updateOne(
              { id: userData?.clients?.userId },
              { subscriptionId: subscription?.id }
            );
            res.json({ msg: "Please Update Your Plan" });
          } else {
            jwt.sign(
              { userDetail },
              process.env.SECRET,
              { expiresIn: process.env.EXPIRES_IN },
              (err, token) => {
                const safeUser = { ...userWithoutPassword[0] };
                delete safeUser.password;

                res.json({
                  token,
                  // user: userWithoutPassword[0],
                  user: safeUser,
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
exports.verifyemail = async (req, res) => {
  const { email } = req.body;
  const user = await Users.aggregate([
    {
      $match: { email: email },
    },
    { $project: { password: 0 } },

    {
      $lookup: {
        from: "agency",
        localField: "agencyId",
        foreignField: "id",
        as: "agency",
        pipeline: [
          {
            $project: { email: 1, name: 1, logo: 1, id: 1, _id: 0 },
          },
        ],
      },
    },
    {
      $addFields: {
        agency: { $arrayElemAt: ["$agency", 0] },
      },
    },
    {
      $project: { email: 1, name: 1, agency: 1, image: 1, id: 1, _id: 0 },
    },
    {
      $facet: {
        data: [],
        count: [{ $group: { _id: null, count: { $sum: 1 } } }],
      },
    },
  ]);

  const result = {
    data: user[0].data,
    count: user[0].count[0] ? user[0].count[0].count : 0,
  };
  res.json({
    data: result.data,
    Total_Agency: result.count,
  });
};
exports.VerifyToken = async (req, res) => {
  const { token } = req.query;
  let expired = false;
  jwt.verify(token, process.env.SECRET, (err, authdata) => {
    if (err) {
      console.log("invalid token or expired token");
      expired = true;
    }
  });

  res.json({ expired });
};

exports.refreshToken = async (req, res) => {
  try {
  const { email, password } = req.body;

    const user = await Users.findOne({ email });
    if (!user) {
      return res.json({
        msg: "user is not valid",
      });
    }

    if (!user?.password) {
      return res.json({ msg: "user is not valid" });
    }
    // Support both hashed and legacy plain-text passwords
    const isBcrypt = !!user.isBcrypt;
    let isPasswordValid = false;

    if (isBcrypt) {
      // isPasswordValid = await bcrypt.compare(password || "", user.password || "");
      isPasswordValid = await bcrypt.compare(
        String(password || ""),
        String(user.password)
      );
    } else {
      // isPasswordValid = user.password === password;
      isPasswordValid = String(user.password) === String(password);
    }

    if (!isPasswordValid) {
      return res.json({
        // msg: "user is not valid",
        msg: "password is not valid",
      });
    }

    const userWithoutPassword = user.toObject
      ? { ...user.toObject(), password: undefined }
      : { ...user, password: undefined };

        jwt.sign(
      { result: userWithoutPassword },
          process.env.SECRET,
          { expiresIn: process.env.RE_EXPIRES_IN },
          (err, token) => {
        if (err) {
          console.log("refresh token error", err);
          return res.json({
            msg: "user is not valid",
          });
        }
            res.json({
              token,
          user: userWithoutPassword,
            });
          }
        );
  } catch (err) {
    console.log("login user", err);
        res.json({
          msg: "user is not valid",
        });
      }
};

const daysCountMiddleware = (req, res, next) => {
  const subscriptionTime = req?.timeDuration;
  //  const subscriptionTime = null;
  if (subscriptionTime == null) {
    return null;
  }

  const subscriptionDate = req?.createdAt;

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
