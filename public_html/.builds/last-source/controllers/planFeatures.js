const PlanFeatures = require("../models/PlanFeatures");

exports.getallPlanFeatures = async (req, res) => {
  try {
    const features = await PlanFeatures.query();
    res.json(features);
  } catch (err) {
    res.json({ msg: "something went wrong on getallPlanFeatures" });
    console.info("----------------------------");
    console.info("err =>", err);
    console.info("----------------------------");
  }
};

exports.createPlanFetures = async (req, res) => {
  const data = req.body;
  try {
    const features = await PlanFeatures.query().insertAndFetch(data);
    res.json(features);
  } catch (err) {
    res.json({ msg: "something went wrong on getallPlanFeatures" });
    console.info("----------------------------");
    console.info("err =>", err);
    console.info("----------------------------");
  }
};
