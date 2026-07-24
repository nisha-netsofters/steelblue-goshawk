const { default: mongoose } = require("mongoose");
const { fileUpload } = require("../middleware/contentful");
const OnBoarding = require("../models-v2/onBoarding_Mongoose");
const User = require("../models-v2/users_Mongoose");

exports.createOnBoarding = async (req, res) => {
  const data = req.body;
  let objectid = new mongoose.Types.ObjectId();
  const agencyId = req.headers["agencyid"];
  try {
    let onboarding = await OnBoarding.create({
      id: objectid,
      _id: objectid,
      agencyId: agencyId,
      ...data,
    });
    res.json(onboarding);
  } catch (error) {
    console.log("onBoarding create err", error);
  }
};

exports.getOnBoarding = async (req, res) => {
  let { userId } = req.query;
  let page = req.query?.page || 1;
  let perPage = req.query?.perPage || 10;
  const agencyId = req.headers["agencyid"];
  if (page == "undefined" || page == "null") {
    page = 1;
  }
  if (perPage == "undefined" || perPage == "null") {
    perPage = 10;
  }

  page -= 1;

  const skip = Number(page * perPage);
  try {
    const jobOnBoarding = req.body;
    const field = [
      "userId",
      "jobCategoryId",
      "gender",
      "salaryRangeStart",
      "salaryRangeEnd",
    ];
    const userRole = await User.aggregate([
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
    ]);

    let queryobj = {};

    if (userRole[0]?.role?.name == "Recruiter") {
      queryobj = {
        ...queryobj,
        userId: userId,
      };
    }
    for (const key in jobOnBoarding) {
      if (key === "statsYear" || key === "statsMonth") {
        continue;
      }
      if (field.includes(key)) {
        queryobj = {
          ...queryobj,
          [key]: jobOnBoarding[key],
        };
      } else {
        queryobj = {
          ...queryobj,
          [key]: { $regex: new RegExp(jobOnBoarding[key], "i") },
        };
      }
    }

    let statsYear = jobOnBoarding?.statsYear
      ? Number(jobOnBoarding.statsYear)
      : 0;
    let statsMonth = jobOnBoarding?.statsMonth
      ? Number(jobOnBoarding.statsMonth)
      : 0;
    if (statsYear || statsMonth) {
      if (!statsYear) {
        statsYear = new Date().getFullYear();
      }
      let from;
      let to;
      if (!statsMonth) {
        from = new Date(`${statsYear}-01-01`);
        to = new Date(`${statsYear}-12-31T23:59:59.999`);
      } else {
        from = new Date(statsYear, statsMonth - 1, 1);
        to = new Date(statsYear, statsMonth, 0, 23, 59, 59, 999);
      }
      queryobj = {
        ...queryobj,
        createdAt: { $gte: from, $lte: to },
      };
    }

    const onBoardingFilter = await OnBoarding.aggregate([
      {
        $match: { isdeleted: 0 },
      },
      {
        $sort: { createdAt: -1 },
      },
      {
        $match: { agencyId: agencyId },
      },
      {
        $match: queryobj,
      },
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "id",
          as: "users",
          pipeline: [
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
          ],
        },
      },
      {
        $addFields: {
          users: { $arrayElemAt: ["$users", 0] },
        },
      },
      {
        $lookup: {
          from: "jobCategory",
          localField: "jobCategoryId",
          foreignField: "id",
          as: "jobCategory",
        },
      },
      {
        $addFields: {
          jobCategory: { $arrayElemAt: ["$jobCategory", 0] },
        },
      },
      {
        $lookup: {
          from: "industries",
          localField: "industriesId",
          foreignField: "id",
          as: "industries",
        },
      },
      {
        $addFields: {
          industries: { $arrayElemAt: ["$industries", 0] },
        },
      },
      {
        $skip: skip,
      },
      {
        $limit: Number(perPage),
      },
    ]);
    const count = await OnBoarding.countDocuments({
      ...queryobj,
    });
    res.json({
      results: onBoardingFilter,
      total: count,
    });
  } catch (err) {
    console.log("dataa onBoarding filter errr", err);
    res.json({ msg: err });
  }
};

exports.updateOnBoarding = async (req, res) => {
  const data = req.body;
  try {
    await OnBoarding.findOneAndUpdate({ id: req.params.id }, { $set: data });
    res.json({ msg: "success" });
  } catch (error) {
    console.log("update onboarding error", error);
    res.json({ msg: "failed", error });
  }
};

exports.deleteOnBoarding = async (req, res) => {
  const id = req.params.id;
  await OnBoarding.deleteOne({ id: id })
    .then((r) => res.json({ msg: "success" }))
    .catch((err) => console.log("onBoarding delete err", err));
};
