const Candidate = require("../models/Candidate");
const Plans = require("../models/Plan");
const Saved_candidates = require("../models/Saved_candidates");
const Subscriptions = require("../models/Subscriptions");
const User = require("../models/User");

exports.getAllSubscriptions = async (req, res) => {
  try {
    const subscriptions = await Subscriptions.query().withGraphFetched(
      "plan.planFeature"
    );
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
      const subscription = await Subscriptions.query()
        .findById(subscriptionId)
        .withGraphFetched("plan.planFeature");
      res.status(200).json(subscription);
    } else {
      res.status(400).json({
        msg: "provide appropriate information",
      });
    }
  } catch (error) {}
};

exports.createSubscription = async (req, res) => {
  try {
    const data = req.body;
    const subscription = await Subscriptions.query().insertAndFetch(data);
    res.status(200).json(subscription);
  } catch (err) {
    res.status(500).json({
      msg: "Something went wrong",
    });
  }
};

exports.createFreeSubscriptionForAllClients = async (req, res) => {
  try {
    const getFreeplanData = await Plans.query()
      .withGraphFetched("planFeature")
      .findOne("planName", "free");

    const allClients = await User.query()
      .withGraphJoined("role")
      .where("role.name", "Client");
    const subscriptionDetails = [];
    for (const client of allClients) {
      const subscription = await Subscriptions.query().insert({
        userId: client.id,
        planId: getFreeplanData.id,
      });
      subscriptionDetails.push({
        id: client.id,
        subscriptionId: subscription.id,
      });
    }
    const userData = await User.query()
      .upsertGraphAndFetch(subscriptionDetails, {
        relate: true,
      })
      .withGraphFetched("subscription.plan.planFeature");
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
    let subscription = await Subscriptions.query()
      .where("id", "=", subscriptionId)
      .withGraphFetched("plan.planFeature")
      .orderBy("created_at", "desc")
      .first();
    const findSavedCandidates = await Saved_candidates.query()
      // .count("* as count")
      .where("candidateId", candidateId)
      .andWhere("userId", userId);
    if (findSavedCandidates?.length == 0) {
      if (subscription?.resume_download_count == -1) {
        const insertedData = await Saved_candidates.query().insertAndFetch({
          candidateId,
          userId,
        });
        const user = await User.query()
          .findOne({
            id: userId,
          })
          .withGraphFetched("subscription.plan.planFeature");
        res.status(200).json({
          currentPlan: user?.subscription?.plan,
          currentSubscription: user?.subscription,
        });
      } else if (
        subscription?.resume_download_count < 5 &&
        subscription?.resume_download_count != -1
      ) {
        const insertedData = await Saved_candidates.query().insertAndFetch({
          candidateId,
          userId,
        });
        const user = await User.query()
          .upsertGraph({
            id: userId,
            subscription: {
              ...subscription,
              resume_download_count: subscription.resume_download_count + 1,
            },
          })
          .withGraphFetched("subscription.plan.planFeature");
        res.status(200).json({
          currentPlan: user?.subscription?.plan,
          currentSubscription: user?.subscription,
        });
      } else if (
        subscription?.resume_download_count ==
        Number(subscription?.plan?.planFeature?.resume_download_count)
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
``;