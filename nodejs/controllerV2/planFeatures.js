const { default: mongoose } = require("mongoose");
const PlanFeatures = require("../models-v2/planFeatures_Mongoose");

exports.getallPlanFeatures = async (req, res) => {
  try {
    const features = await PlanFeatures.aggregate([
      {
        $sort: { createdAt: -1 },
      },
    ]);
    res.json(features);
  } catch (err) {
    res.json({ msg: "something went wrong on getallPlanFeatures" });
  }
};

exports.createPlanFetures = async (req, res) => {
  const data = req.body;
  let objectid = new mongoose.Types.ObjectId();
  try {
    const features = await PlanFeatures.create({
      id: objectid,
      _id: objectid,
      ...data,
    });
    res.json(features);
  } catch (err) {
    res.json({ msg: "something went wrong on getallPlanFeatures" });
    console.info("----------------------------");
    console.info("err =>", err);
    console.info("----------------------------");
  }
};
