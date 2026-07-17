const Plans = require("../models-v2/plans_Mongoose");
const PlanFeatures = require("../models-v2/planFeatures_Mongoose");
const Subscriptions = require("../models-v2/subscriptions_Mongoose");
const User = require("../models-v2/users_Mongoose");
const { default: mongoose } = require("mongoose");

exports.daysCountMiddleware = async (req, res, next) => {
  const userId = req?.body?.userId || req.headers.userid;
  const userData = await User.findOne({ id: userId });
  const subscriptionData = await Subscriptions.findOne({
    id: userData?.subscriptionId,
  });
  const planData = await Plans.findOne({ id: req?.query?.planId });
  const planFeaturesData = await PlanFeatures.findOne({
    id: planData?.plan_feature_id,
  });

  const subscriptionTime = planFeaturesData?.validate_days;

  if (subscriptionTime == null) {
    return next();
  } else {
    const startDate = new Date(subscriptionData?.createdAt);
    const today = new Date();
    const diffInMs = today - startDate;
    const daysCount = Math.floor(diffInMs / (1000 * 60 * 60 * 24));
    if (subscriptionTime >= daysCount) {
      return next();
    } else {
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
      const objectid = new mongoose.Types.ObjectId();
      const subscription = await Subscriptions.create({
        id: objectid,
        _id: objectid,
        userId: userId,
        planId: getFreeplanData[0].id,
        resume_download_count: 5,
      });

      await User.updateOne(
        {
          id: userId,
        },
        {
          subscriptionId: subscription?.id,
        }
      );

      return res.json({ msg: "Please Update Your Plan" });
    }
  }
};
