const { default: mongoose } = require("mongoose");
const Candidate = require("../models-v2/candidates_Mongoose");
const Plans = require("../models-v2/plans_Mongoose");
const Saved_candidates = require("../models-v2/savedCandidates_Mongoose");
const Subscriptions = require("../models-v2/subscriptions_Mongoose");
const User = require("../models-v2/users_Mongoose");
const Subscription = require("../models-v2/subscriptions_Mongoose");

exports.getAllSubscriptions = async (req, res) => {
  try {
    const subscriptions = await Subscriptions.aggregate([
      {
        $lookup: {
          from: "plans",
          localField: "planId",
          foreignField: "id",
          as: "plans",
        },
      },
      {
        $lookup: {
          from: "plan_features",
          localField: "plans.plan_feature_id",
          foreignField: "id",
          as: "planFeatures",
        },
      },
    ]);
    res.status(200).json(subscriptions);
  } catch (err) {
    res.status(500).json({
      msg: "Something went wrong",
    });
  }
};

exports.getClientSubscription = async (req, res) => {
  const { subscriptionId } = req.query;
  try {
    if (subscriptionId) {
      const subscription = await Subscriptions.aggregate([
        {
          $match: {
            id: subscriptionId,
          },
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
                  as: "plan_features",
                },
              },
              {
                $addFields: {
                  plan_features: { $arrayElemAt: ["$plan_features", 0] },
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
      ]);
      res.status(200).json(subscription[0]);
    } else {
      res.status(400).json({
        msg: "provide appropriate information",
      });
    }
  } catch (error) {}
};

exports.createSubscription = async (req, res) => {
  try {
    const objectid = mongoose.Types.ObjectId();
    const data = req.body;
    const agencyId = req.headers["agencyid"];

    const subscription = await Subscriptions.create({
      _id: objectid,
      id: objectid,
      agencyId: agencyId,
      ...data,
    });
    res.status(200).json(subscription);
  } catch (err) {
    res.status(500).json({
      msg: "Something went wrong",
    });
  }
};

exports.createFreeSubscriptionForAllClients = async (req, res) => {
  try {
    const getFreeplanData = await Plans.aggregate([
      { $match: { planName: "free" } },
      {
        $lookup: {
          from: "plan_features",
          localField: "plan_feature_id",
          foreignField: "id",
          as: "planFeatures",
        },
      },
    ]);
    const allClients = await User.aggregate([
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
    const subscriptionDetails = [];
    for (const client of allClients) {
      const objectid = new mongoose.Types.ObjectId();
      const subscription = await Subscriptions.create({
        userId: client.id,
        planId: getFreeplanData.id,
        id: objectid,
        _id: objectid,
      });
      subscriptionDetails.push({
        id: client.id,
        subscriptionId: subscription.id,
      });
    }
    await User.updateOne(subscriptionDetails);
    const userData = await User.aggregate([
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
        },
      },
      {
        $lookup: {
          from: "plans",
          localField: "subscription.planId",
          foreignField: "id",
          as: "plan",
        },
      },
      {
        $lookup: {
          from: "plan_features",
          localField: "plan.plan_feature_id",
          foreignField: "id",
          as: "planFeature",
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

exports.decreaseResumeDownloadFreeSubscription = async (req, res) => {
  try {
    const { userId, subscriptionId, candidateId } = req.query;
    let subscription = await Subscriptions.aggregate([
      {
        $sort: { createdAt: -1 },
      },
      {
        $match: { id: subscriptionId },
      },
      {
        $lookup: {
          from: "plans",
          localField: "planId",
          foreignField: "id",
          as: "plan",
        },
      },
      {
        $addFields: {
          plan: { $arrayElemAt: ["$plan", 0] },
        },
      },
      {
        $lookup: {
          from: "plan_features",
          localField: "plan.plan_feature_id",
          foreignField: "id",
          as: "planFeature",
        },
      },
      {
        $addFields: {
          planFeature: { $arrayElemAt: ["$planFeature", 0] },
        },
      },
      {
        $limit: 1,
      },
    ]);
    if (subscription.length > 0) {
      subscription = subscription[0];
    }
    const findSavedCandidates = await Saved_candidates.aggregate([
      {
        $match: { candidateId: candidateId },
      },
      {
        $match: { userId: userId },
      },
    ]);
    if (findSavedCandidates?.length == 0) {
      if (subscription?.resume_download_count == -1) {
        const objectid2 = new mongoose.Types.ObjectId();
        const insertedData = await Saved_candidates.create({
          id: objectid2,
          _id: objectid2,
          candidateId: candidateId,
          userId: userId,
        });
        let user = await User.aggregate([
          {
            $match: { id: userId },
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
          {
            $lookup: {
              from: "plans",
              localField: "subscription.planId",
              foreignField: "id",
              as: "plan",
              pipeline: [
                {
                  $lookup: {
                    from: "plan_features",
                    localField: "plan.plan_feature_id",
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
        ]);
        if (user.length > 0) {
          user = user[0];
        }
        res.status(200).json({
          currentPlan: user?.subscription?.plan,
          currentSubscription: user?.subscription,
        });
        // const objectid = new mongoose.Types.ObjectId();
      } else if (
        subscription?.resume_download_count < 5 &&
        subscription?.resume_download_count != -1
      ) {
        console.log("1-5");
        const plusone = Number(subscription.resume_download_count) + 1;
        const objectid = new mongoose.Types.ObjectId();
        const insertedData = await Saved_candidates.create({
          id: objectid,
          _id: objectid,
          candidateId,
          userId,
        });
        await Subscription.updateOne(
          { id: subscription.id },
          {
            $set: {
              ...subscription,
              resume_download_count: plusone,
            },
          }
        ).then((resp) => console.log("resssp", resp));

        let user = await User.aggregate([
          {
            $sort: { createdAt: -1 },
          },
          { $match: { id: userId } },
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
                  $sort: { createdAt: -1 },
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
                // gotta change plans to plan
                {
                  $addFields: {
                    plan: { $arrayElemAt: ["$plan", 0] },
                  },
                },
              ],
            },
          },
          {
            $lookup: {
              from: "plans",
              localField: "subscription.planId",
              foreignField: "id",
              as: "plan",
            },
          },
          {
            $addFields: {
              plan: { $arrayElemAt: ["$plan", 0] },
            },
          },
          {
            $addFields: {
              subscription: { $arrayElemAt: ["$subscription", 0] },
            },
          },
          {
            $lookup: {
              from: "plan_features",
              localField: "plan.plan_feature_id",
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
        if (user.length > 0) {
          user = user[0];
        }
        res.status(200).json({
          currentPlan: user?.subscription?.plan,
          currentSubscription: user?.subscription,
        });
      } else if (
        subscription?.resume_download_count ==
        Number(subscription?.planFeature?.resume_download_count)
      ) {
        res.json({
          msg: "You can't download resume more than 5, please upgrade your plan!!",
        });
      } else if (subscription == undefined || subscription == null) {
        res.status(400).json({
          msg: "Please provide appropriate details",
        });
      } else {
        res.status(400).json({
          msg: "Please provide appropriate details",
        });
      }
    } else {
      res.status(200).json({
        isSavedCandidate: true,
      });
    }
  } catch (err) {
    console.info("----------------------------");
    console.info("err =>", err);
    console.info("----------------------------");
    res.status(500).json({
      msg: "Something went wrong",
    });
  }
};
