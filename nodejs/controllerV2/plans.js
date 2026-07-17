const Plans = require("../models-v2/plans_Mongoose");
const taxwithdivided = process.env.TAX / 100;

exports.getAllPlans = async (req, res) => {
  try {
    const plans = await Plans.aggregate([
      {
        $sort: { created_at: 1 },
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
          Tax: process.env.TAX,
        },
      },
      {
        $addFields: {
          priceNumeric: { $toDouble: "$price" },
        },
      },
      {
        $addFields: {
          taxAmount: {
            $multiply: ["$priceNumeric", Number(taxwithdivided)],
          },
        },
      },
      {
        $addFields: {
          totalAmountWithTax: { $add: ["$priceNumeric", "$taxAmount"] },
        },
      },
      {
        $addFields: {
          planFeature: { $arrayElemAt: ["$planFeature", 0] },
        },
      },
    ]);
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
exports.getPlanbyId = async (req, res) => {
  try {
    const id = req?.body.id;
    if (!id) {
      return res.json({
        msg: "Id is Invalid",
      });
    }
    const plans = await Plans.aggregate([
      {
        $match: { id: id },
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
          Tax: process.env.TAX,
        },
      },
      {
        $addFields: {
          priceNumeric: { $toDouble: "$price" },
        },
      },
      {
        $addFields: {
          taxAmount: {
            $multiply: ["$priceNumeric", Number(taxwithdivided)],
          },
        },
      },
      {
        $addFields: {
          totalAmountWithTax: { $add: ["$priceNumeric", "$taxAmount"] },
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
    res.status(200).json(plans[0]);
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
    const plans = await Plans.create(data);
    res.status(200).json(plans);
  } catch (err) {
    res.status(500).json({
      msg: "Something went wrong",
    });
  }
};
