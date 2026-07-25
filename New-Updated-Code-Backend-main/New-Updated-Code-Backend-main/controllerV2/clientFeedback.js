const { default: mongoose } = require("mongoose");
const ClientFeedback = require("../models-v2/clientFeedback_Mongoose");
const OnBoarding = require("../models-v2/onBoarding_Mongoose");

exports.createClientFeedback = async (req, res) => {
  const data = req.body;
  let objectId = new mongoose.Types.ObjectId();
  const agencyId = req.headers["agencyid"];

  await ClientFeedback.create({
    _id: objectId,
    id: objectId,
    agencyId: agencyId,
    ...data,
  })
    .then((resp) => res.json(resp))
    .catch((err) => console.log("create client Feedback err", err));
};

exports.getClientFeedback = async (req, res) => {
  try {
    let { page, perPage } = req.query;
    page -= 1;
    const clientFeedbackFilter = req.body;
  const agencyId = req.headers["agencyid"];

  let query = {};

  for (const key in clientFeedbackFilter) {
    if (key === "onBoardingId") {
      query["onBoardingId"] = clientFeedbackFilter[key];
    } else {
      query[key] = { $regex: new RegExp(clientFeedbackFilter[key], "i") };
    }
  }

  const pipeline = [
    {
      $sort: { createdAt: -1 },
    },
    {
      $match: query,
    },
    {
      $match: { isdeleted: 0 },
    },
    {
      $lookup: {
        from: "onBoarding",
        localField: "onBoardingId",
        foreignField: "id",
        as: "onBoarding",
      },
    },
    {
      $addFields: {
        onBoarding: { $arrayElemAt: ["$onBoarding", 0] },
      },
    },
    {
      $lookup: {
        from: "clients",
        localField: "onBoardingId",
        foreignField: "id",
        as: "clients",
      },
    },
    {
      $addFields: {
        clients: { $arrayElemAt: ["$clients", 0] },
      },
    },
    {
      $match: { agencyId: agencyId },
    },
  ];

  const clientFeedback_Filter_Data = await ClientFeedback.aggregate([
    ...pipeline,
    {
      $facet: {
        data: [
          {
            $skip: page * perPage,
          },
          {
            $limit: Number(perPage),
          },
        ],
        count: [
          { $match: query }, // Add a match stage for the query
          { $group: { _id: null, count: { $sum: 1 } } },
        ],
      },
    },
  ]);

    const result = {
      data: clientFeedback_Filter_Data[0].data,
      count: clientFeedback_Filter_Data[0].count[0]
        ? clientFeedback_Filter_Data[0].count[0].count
        : 0,
    };

    res.json({
      results: result.data,
      total: result.count,
    });
  } catch (err) {
    console.log("dataa ClientFeedback filter errr", err);
    res.json({ msg: err });
  }
};

exports.updateClientFeedback = async (req, res) => {
  let clientFeedback = req.body;
  try {
    let id = req.params.id;
    await ClientFeedback.updateOne({ id: id }, { ...clientFeedback });
    res.json({ msg: "success" });
  } catch (err) {
    console.log("dataa clientFeedback update errr", err);
    res.json({ msg: err });
  }
};

exports.deleteClientFeedback = async (req, res) => {
  try {
    const id = req.params.id;
    await ClientFeedback.updateOne({ id: id }, { isdeleted: 1 });
    res.json({ msg: "success" });
  } catch (err) {
    console.log("dataa clientFeedback delete errr", err);
    res.json({ msg: err });
  }
};
