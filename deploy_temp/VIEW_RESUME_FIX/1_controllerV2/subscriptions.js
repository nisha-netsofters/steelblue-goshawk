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

    if (!userId || !candidateId) {
      return res.status(400).json({
        msg: "userId and candidateId are required",
      });
    }

    // Already viewed/saved → allow open without counting again
    const findSavedCandidates = await Saved_candidates.aggregate([
      {
        $match: {
          candidateId: String(candidateId),
          userId: String(userId),
        },
      },
    ]);
    if (findSavedCandidates?.length > 0) {
      return res.status(200).json({
        isSavedCandidate: true,
      });
    }

    let subscriptionMatch = [];
    if (subscriptionId && subscriptionId !== "undefined" && subscriptionId !== "null") {
      subscriptionMatch = await Subscriptions.aggregate([
        { $match: { id: String(subscriptionId) } },
        { $sort: { createdAt: -1 } },
        { $limit: 1 },
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
      ]);
    }

    // Fallback: latest subscription for this user
    if (!subscriptionMatch?.length) {
      subscriptionMatch = await Subscriptions.aggregate([
        { $match: { userId: String(userId) } },
        { $sort: { createdAt: -1 } },
        { $limit: 1 },
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
      ]);
    }

    if (!subscriptionMatch?.length) {
      return res.status(200).json({
        msg: "No active subscription found. Please upgrade your plan to view resumes.",
      });
    }

    const subscription = subscriptionMatch[0];
    const usedCount = Number(subscription?.resume_download_count ?? 0);
    const planLimitRaw =
      subscription?.planFeature?.resume_download_count ??
      subscription?.plan?.planFeature?.resume_download_count ??
      5;
    const planLimit = Number(planLimitRaw);

    const buildUserSubscriptionResponse = async () => {
      let user = await User.aggregate([
        { $match: { id: String(userId) } },
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
              { $sort: { createdAt: -1 } },
              { $limit: 1 },
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
      if (user.length > 0) user = user[0];
      return {
        currentPlan: user?.subscription?.plan,
        currentSubscription: user?.subscription,
      };
    };

    // Unlimited plan
    if (usedCount === -1 || planLimit === -1) {
      const objectid2 = new mongoose.Types.ObjectId();
      await Saved_candidates.create({
        id: String(objectid2),
        _id: objectid2,
        candidateId: String(candidateId),
        userId: String(userId),
      });
      const payload = await buildUserSubscriptionResponse();
      return res.status(200).json(payload);
    }

    const maxAllowed = Number.isFinite(planLimit) && planLimit > 0 ? planLimit : 5;

    if (usedCount < maxAllowed) {
      const plusone = usedCount + 1;
      const objectid = new mongoose.Types.ObjectId();
      await Saved_candidates.create({
        id: String(objectid),
        _id: objectid,
        candidateId: String(candidateId),
        userId: String(userId),
      });
      await Subscription.updateOne(
        { id: subscription.id },
        {
          $set: {
            resume_download_count: plusone,
          },
        }
      );
      const payload = await buildUserSubscriptionResponse();
      return res.status(200).json(payload);
    }

    return res.status(200).json({
      msg: `You can't download resume more than ${maxAllowed}, please upgrade your plan!!`,
    });
  } catch (err) {
    console.info("----------------------------");
    console.info("err =>", err);
    console.info("----------------------------");
    return res.status(500).json({
      msg: "Something went wrong",
    });
  }
};
