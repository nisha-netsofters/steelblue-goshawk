const Plans = require("../models/Plan");

exports.getAllPlans = async (req, res) => {
  try {
    const plans = await Plans.query()
      .withGraphFetched("planFeature")
      .orderBy("price", "asc");
    res.status(200).json(plans);
  } catch (err) {
    console.info("----------------------------");
    console.info("err =>", err);
    console.info("----------------------------");
    res.status(500).json({
      msg: "Something went wrong",
    });
  }
};

exports.createPlans = async (req, res) => {
  try {
    const data = req?.body;
    const plans = await Plans.query().insertAndFetch(data);
    res.status(200).json(plans);
  } catch (err) {
    res.status(500).json({
      msg: "Something went wrong",
    });
  }
};
