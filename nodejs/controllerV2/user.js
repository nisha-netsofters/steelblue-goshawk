
const Subscriptions = require("../models-v2/subscriptions_Mongoose");
const Payments = require("../models-v2/payments_Mongoose");
const Plans = require("../models-v2/plans_Mongoose");
const PlanFeatures = require("../models-v2/planFeatures_Mongoose");
const Clients = require("../models-v2/clients_Mongoose");
const Users = require("../models-v2/users_Mongoose");
const Candidates = require("../models-v2/candidates_Mongoose");
const _ = require("lodash");
const { default: mongoose } = require("mongoose");
const { awsUploadFiles } = require("../middleware/awsS3");
const bcrypt = require("bcryptjs");
const { enqueueEmailJob } = require("../mq/emailProducer");
const {
  sendPlanAssignWhatsapp,
} = require("../middleware/whatsappMSG/clientJoinWhatsapp");

exports.createUser = async (req, res) => {
  let { ...user } = req.body;
  const existingClientsEmail = await Users.findOne({
    email: user.email,
  });
  if (existingClientsEmail) {
    return res.json({
      error: "Your email is already in used",
    });
  }
  const existingClientsMobile = await Users.findOne({
    mobile: user.mobile,
  });
  if (existingClientsMobile) {
    return res.json({
      error: "Your Mobile number is already in used",
    });
  }

  if (req?.files?.image) {
    let resp = await awsUploadFiles(req.files.image);
    user.image = `${resp.url}`;
  }
  try {
    const objectid = new mongoose.Types.ObjectId();
    const agencyId = req.headers["agencyid"];

    // Hash password for newly created users (if provided)
    if (user.password) {
      user.password = await bcrypt.hash(user.password, 10);
      user.isBcrypt = true;
    }

    const userdata = await Users.create({
      ...user,
      agencyId: agencyId,
      id: objectid,
      _id: objectid,
    });
    res.json(userdata);
  } catch (err) {
    res.json({ msg: err });
  }
};

exports.forgotPasswordEmailLink = async (req, res) => {
  let { email } = req.body;
  if (email !== undefined) {
    await Users.findOne({
      email,
    }).then(async (response) => {
      if (response === null) {
        res.json({ msg: "user does'nt exist" });
      } else if (response?.role?.name === "Client") {
        res.json({ msg: "Client can't change the password" });
      } else {
        await enqueueEmailJob("forgotPassword", { user: response });
        res.json({ msg: "success" });
      }
    });
  } else {
    res.status(502).json("Invalid");
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const { id } = req.query;
    const { password } = req.body;

    if (!id || !password) {
      return res.json({ msg: "Invalid request" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await Users.updateOne(
      { id: id },
      { $set: { password: hashedPassword, isBcrypt: true } }
    );

    res.json({ msg: "success" });
  } catch (err) {
    console.log("resetPassword error =>", err);
    res.json({ msg: "Something went wrong" });
  }
};

exports.passwordUpdate = async (req, res) => {
  try {
    const { id } = req.params;
    const { password, currentPassword } = req.body;

    if (!id || !password || !currentPassword) {
      return res.json({ msg: "Invalid request" });
    }

    const userData = await Users.findOne({ id });

    if (!userData) {
      return res.json({ msg: "user is not valid" });
    }

    // Support both hashed and legacy plain-text passwords for current password check
    const isBcrypt = !!userData.isBcrypt;
    let isCurrentValid = false;

    if (isBcrypt) {
      isCurrentValid = await bcrypt.compare(
        currentPassword || "",
        userData.password || ""
      );
    } else {
      isCurrentValid = userData.password === currentPassword;
    }

    if (!isCurrentValid) {
      return res.json({ msg: "Current password doesn't match" });
    }

    const hashedNewPassword = await bcrypt.hash(password, 10);
    userData.password = hashedNewPassword;
    userData.isBcrypt = true;

    await userData.save();

    res.json({ msg: "success" });
  } catch (err) {
    console.log("password update", err);
    res.json({ msg: "Something went wrong" });
  }
};

const pickUserUpdateFields = (body, uploadedImageUrl) => {
  const src = body || {};
  const next = {};
  const keys = [
    "name",
    "email",
    "mobile",
    "address",
    "comments",
    "roleId",
    "subscriptionId",
    "paymentMethod",
    "planId",
    "cityId",
    "stateId",
    "city",
    "state",
    "BillingDetails",
  ];
  for (const key of keys) {
    if (src[key] !== undefined && src[key] !== "undefined" && src[key] !== "null") {
      next[key] = src[key];
    }
  }
  if (uploadedImageUrl) {
    next.image = uploadedImageUrl;
  } else if (
    typeof src.image === "string" &&
    src.image.trim() !== "" &&
    src.image !== "undefined" &&
    !src.image.startsWith("[object")
  ) {
    next.image = src.image;
  }
  return next;
};

exports.userUpdate = async (req, res) => {
  const agencyIdHeader = req.headers["agencyid"];
  try {
    const body = req.body || {};
    const { image, role, agencyId, clients, subscription, ...user } = body;
    const id = req.params.id;
    if (user.email) {
      const existingClientsEmail = await Users.aggregate([
        {
          $project: { password: 0 },
        },
        {
          $match: {
            email: user.email,
            agencyId: agencyIdHeader,
            id: { $ne: id },
          },
        },
      ]);
      if (existingClientsEmail.length > 0) {
        return res.json({
          error: "Your email is already in used",
        });
      }
    }
    if (user.mobile) {
      const existingClientsMobile = await Users.aggregate([
        {
          $match: {
            mobile: user.mobile,
            agencyId: agencyIdHeader,
            id: { $ne: id },
          },
        },
      ]);
      if (existingClientsMobile.length > 0) {
        return res.json({
          error: "Your Mobile number is already in used",
        });
      }
    }
    let uploadedImageUrl = null;
    if (req?.files?.image) {
      let resp = await awsUploadFiles(req.files.image);
      if (resp?.success && resp?.url) {
        uploadedImageUrl = `${resp.url}`;
      }
    }
    const updateFields = pickUserUpdateFields(
      { ...user, image },
      uploadedImageUrl
    );
    if (Object.keys(updateFields).length > 0) {
      await Users.updateOne({ id }, { $set: updateFields });
    }
    // Candidate self-profile edits should never retrigger WhatsApp flows.
    try {
      await Candidates.updateMany(
        { userId: id },
        { $set: { whatsappMsg: true, updatedAt: new Date() } }
      );
    } catch (candidateSyncErr) {
      console.info(
        "userUpdate candidate sync error =>",
        candidateSyncErr?.message || candidateSyncErr
      );
    }
    if (clients?.id && user?.name) {
      await Clients.updateOne(
        { id: clients.id },
        {
          $set: {
            companyowner: user?.name,
            mobile: user?.mobile,
            email: user?.email,
            address: user?.address,
            cityId: user?.cityId,
            stateId: user?.stateId,
            city: user?.city,
            state: user?.state,
          },
        }
      );
    }
    const resolvedAgencyId = agencyId || agencyIdHeader;
    if (
      user?.planId != "null" &&
      user?.planId != "undefined" &&
      user?.planId != undefined &&
      user?.planId != null
    ) {
      if (user?.planId !== subscription?.planId) {
        const planData = await Plans.findOne({ id: user?.planId });
        const prevPaymentData = await Clients.findOne({
          userId: user?.id || id,
        });
        const paymentObj = {
          userId: user?.id || id,
          paymentId: `${Date.now()}${String(user?.mobile || "").slice(0, 3)}`,
          entity: "payment",
          amount: planData?.price,
          status: "captured",
          currency: "INR",
          orderId: null,
          invoiceId: null,
          method: user?.paymentMethod,
          captured: true,
          cardId: null,
          email: user?.email,
          contact: user?.mobile,
          notes: JSON.stringify({
            customerId: prevPaymentData?.razorpayCustId,
            userId: user?.id || id,
            clientId: prevPaymentData?.id,
            planId: user?.planId,
          }),
          fee: 0,
          tax: 0,
          errorCode: null,
          errorDescription: null,
          errorSource: null,
          errorStep: null,
          errorEeason: null,
          customerId: prevPaymentData?.razorpayCustId,
        };
        const objectid2 = new mongoose.Types.ObjectId();
        const paymentData = await Payments.create({
          agencyId: resolvedAgencyId,
          id: objectid2,
          _id: objectid2,
          ...paymentObj,
        });
        if (planData !== undefined) {
          const planFeaturesData = await PlanFeatures.findOne({
            id: planData?.plan_feature_id,
          });
          let subscriptionObj = {};

          if (
            (planData.planName == "free" || planData.planName == "Trial") &&
            (subscription?.plan?.planName == "free" ||
              subscription?.plan?.planName == "Trial")
          ) {
            subscriptionObj = {
              planId: user?.planId,
              userId: user?.id || id,
              payment_id: paymentData?.id,
              active_plan:
                _.toLower(planData?.planName) == "free" ||
                _.toLower(planData?.planName) == "trial"
                  ? false
                  : true,
              resume_download_count: subscription?.resume_download_count,
              interview_request_count: planFeaturesData?.interview_count,
              timeDuration: planFeaturesData?.validate_days,
            };
          } else {
            subscriptionObj = {
              planId: user?.planId,
              userId: user?.id || id,
              payment_id: paymentData?.id,
              active_plan:
                _.toLower(planData?.planName) == "free" ||
                _.toLower(planData?.planName) == "trial"
                  ? false
                  : true,
              resume_download_count:
                _.toLower(planData?.planName) == "free" ||
                _.toLower(planData?.planName) == "trial"
                  ? 5
                  : -1,
              interview_request_count: planFeaturesData?.interview_count,
              timeDuration: planFeaturesData?.validate_days,
            };
          }

          const objectid = new mongoose.Types.ObjectId();
          const subsciptionData = await Subscriptions.create({
            agencyId: resolvedAgencyId,
            id: objectid,
            _id: objectid,
            ...subscriptionObj,
          });

          await Users.updateOne(
            { id: user?.id || id },
            {
              $set: {
                subscriptionId: subsciptionData.id,
                planId: subsciptionData.planId,
              },
            }
          );
          try {
            sendPlanAssignWhatsapp(user?.id || id).catch((err) => {
              console.info(
                "sendPlanAssignWhatsapp error =>",
                err?.message || err
              );
            });
          } catch (msgErr) {
            console.info(
              "sendPlanAssignWhatsapp trigger error =>",
              msgErr?.message || msgErr
            );
          }
        }
      }
    }

    res.json({ isSuccess: true, msg: "success" });
  } catch (err) {
    console.info("--------------------");
    console.info("err", err);
    console.info("--------------------");
    if (err && err?.constraint === "users_email_unique") {
      res.json({ isSuccess: false, msg: "Email alreday exists." });
    }
    res.json({ isSuccess: false, msg: "Something failed" });
    console.log(JSON.stringify(err));
  }
};

exports.userDelete = async (req, res) => {
  try {
    const id = req.params.id;
    await Users.deleteOne({ id: id });
    res.json({ msg: "success" });
  } catch (err) {
    console.log("user delete", err);
  }
};

exports.detailsUser = async (req, res) => {
  try {
    let userData = await Users.aggregate([
      {
        $project: { password: 0 },
      },
      {
        $sort: { createdAt: -1 },
      },
      {
        $match: { id: req.params.id },
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
        $addFields: {
          clients: { $arrayElemAt: ["$clients", 0] },
        },
      },
      {
        $lookup: {
          from: "agency",
          localField: "agencyId",
          foreignField: "id",
          as: "agency",
          pipeline: [
            {
              $project: { password: 0 },
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
        $lookup: {
          from: "subscriptions",
          localField: "subscriptionId",
          foreignField: "id",
          as: "subscription",
        },
      },
      {
        $addFields: {
          subscription: { $arrayElemAt: ["$subscription", 0] },
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
          from: "industriesRelation",
          localField: "clients.id",
          foreignField: "cId",
          as: "industriesRelation",
        },
      },
      {
        $lookup: {
          from: "industries",
          localField: "industriesRelation.industriesId",
          foreignField: "id",
          as: "industries",
        },
      },
      {
        $lookup: {
          from: "jobCategoryRelation",
          localField: "clients.id",
          foreignField: "cId",
          as: "jobCategoryRelation",
        },
      },
      {
        $lookup: {
          from: "jobCategory",
          localField: "jobCategoryRelation.jobCategoryId",
          foreignField: "id",
          as: "jobCategory",
        },
      },
      {
        $limit: 1,
      },
    ]);
    res.json({ data: userData[0] });
  } catch (err) {
    res.json({ msg: err });
  }
};

exports.getUsers = async (req, res) => {
  try {
    const page = Number(req.query?.page || 1);
    const perPage = Number(req.query?.perPage || 10);
    const skip = (page - 1) * perPage;
    const agencyId = req.headers["agencyid"];

    const userFilter = req.body;
    let query = {};
    if (Object.keys(userFilter)?.length > 0) {
      // query.$and = [];
      for (const key in userFilter) {
        if (key == "roleId") {
          query = { ...query, [key]: userFilter[key] };
        } else if (key == "planId") {
          query = { ...query, [`subscription.${key}`]: userFilter[key] };
        } else {
          query = {
            ...query,
            [key]: { $regex: new RegExp(userFilter[key], "i") },
          };
        }
      }
    }

    const pipeline = [
      {
        $lookup: {
          from: "clients",
          localField: "id",
          foreignField: "userId",
          as: "clients",
          pipeline: [{ $project: { companyName: 1, _id: 0, id: 1 } }],
        },
      },
      {
        $addFields: {
          clients: { $arrayElemAt: ["$clients", 0] },
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
        $match: { "role.name": { $ne: "Admin" } },
      },
      {
        $lookup: {
          from: "subscriptions",
          localField: "subscriptionId",
          foreignField: "id",
          as: "subscription",
          pipeline: [
            {
              $sort: { createdAt: -1 },
            },
            {
              $limit: 1,
            },
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
    ];

    const uservar = await Users.aggregate([
      {
        $sort: { createdAt: -1 },
      },
      {
        $match: { agencyId: agencyId },
      },
      ...pipeline,
      {
        $facet: {
          data: [
            { $match: query },
            { $skip: skip },
            { $limit: Number(perPage) },
          ],
          count: [{ $match: query }, { $count: "total" }],
        },
      },
    ]);

    res.json({
      results: uservar[0]?.data,
      total: uservar[0]?.count[0]?.total,
    });
  } catch (err) {
    console.log("dataa users filter errr", err);
    res.json({ msg: err });
  }
};

exports.getUsersRoleWise = async (req, res) => {
  const role = req.query.name;
  const agencyId = req.headers["agencyid"];
  let isSelectAll = {};
  let name = ["Admin", "Recruiter", "Team Leader", "Staff"];

  if (role === "Recruiter") {
    name = ["Recruiter"];
    isSelectAll = {
      id: 1,
      name: 1,
    };
  } else if (role === "Staff") {
    name = ["Staff"];
    isSelectAll = {
      id: 1,
      name: 1,
    };
  } else if (role === "JobAssign") {
    // Users who can be assigned as job recruiters
    name = ["Recruiter", "Staff", "Team Leader", "BDM"];
    isSelectAll = {
      id: 1,
      name: 1,
      roleId: 1,
    };
  }
  let filteragency = {};
  if (agencyId) {
    filteragency = { agencyId };
  }

  try {
    let users = await Users.aggregate([
      {
        $project: { password: 0 },
      },
      {
        $sort: { createdAt: -1 },
      },
      {
        $match: filteragency,
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
        $match: { "role.name": { $in: name } },
      },
      {
        $project: {
          _id: 0,
          ...isSelectAll,
        },
      },
    ]);
    res.json(users);
  } catch (err) {
    console.log("dataa users role wise errr", err);
    res.json({ msg: err });
  }
};

exports.getUserData = async (req, res) => {
  try {
    const id = req.params.id;
    if (id) {
      await Users.aggregate([
        {
          $project: { password: 0 },
        },
        {
          $sort: { createdAt: -1 },
        },
        { $match: { id: id } },
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
            from: "clients",
            localField: "id",
            foreignField: "userId",
            as: "clients",
          },
        },
        {
          $addFields: {
            clients: { $arrayElemAt: ["$clients", 0] },
          },
        },
        {
          $lookup: {
            from: "agency",
            localField: "agencyId",
            foreignField: "id",
            as: "agency",
            pipeline: [
              {
                $project: { password: 0 },
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
      ]).then(async (result) => {
        res.json(result[0]);
      });
    } else {
      res.json({ msg: "admin" });
    }
  } catch (err) {
    console.log("dataa users filter errr", err);
    res.json({ msg: err });
  }
};

exports.createFreeSubscription = async (req, res) => {
  try {
    const id = req.params.id;
    const getFreeplanData = await Plans.aggregate([
      {
        $match: { planName: "free" },
      },
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
    ]);

    const allClients = await Users.aggregate([
      {
        $project: { password: 0 },
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
        $match: { "role.name": "Client" },
      },
    ]);
    const objectid = new mongoose.Types.ObjectId();
    const subscriptionDetails = [];
    const subscription = await Subscriptions.create({
      id: objectid,
      _id: objectid,
      userId: id,
      planId: getFreeplanData.id,
      resume_download_count: 0, // resume_download_count: subscription.resume_download_count + 1
    });
    subscriptionDetails.push({
      id: id,
      subscriptionId: subscription.id,
    });
    // }
    await Users.updateOne(subscriptionDetails);
    const userData = await Users.aggregate([
      {
        $project: { password: 0 },
      },
      {
        $match: { id: id },
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
          from: "subscriptions",
          localField: "id",
          foreignField: "userId",
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

    res.status(200).json(userData);
  } catch (error) {
    console.info("----------------------------");
    console.info("error =>", error);
    console.info("----------------------------");
  }
};
exports.planexpireCreateFreeSubscription = async (req, res) => {
  try {
    if (req?.query?.token === process.env.WHATSAPP_NOTIFICATION_CRON_PASSWORD) {
      let user = await Users.aggregate([
        {
          $lookup: {
            from: "subscriptions",
            localField: "subscriptionId",
            foreignField: "id",
            as: "subscription",
            pipeline: [
              {
                $sort: { createdAt: -1 },
              },
              {
                $limit: 1,
              },
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
      ]);
    } else {
      res.json({ msg: "Token is invalid" });
    }
  } catch (error) {
    res.json({ msg: "something went wrong" });
  }
};
