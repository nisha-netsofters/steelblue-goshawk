const Candidate = require("./../models-v2/candidates_Mongoose");
const OnBoarding = require("./../models-v2/onBoarding_Mongoose");
const Role = require("../models-v2/role_Mongoose");
const Interviews = require("../models-v2/interviews_Mongoose");
const User = require("../models-v2/users_Mongoose");
// const { initialize } = require('objection');
const moment = require("moment");
const { ref } = require("objection");
const { raw } = require("objection");
const Agency = require("../models-v2/agency_Mongooes");

exports.dashboard = async (req, res) => {};

exports.statistics = async (req, res) => {
  try {
    let month = Number(req.query.month);
    let year = Number(req.query.year);
    let from = new Date(`${year}-${month}-01`);
    const agencyId = req.headers["agencyid"];
    month += 1;
    if (Number(req.query.month) === 12) {
      year = Number(year) + 1;
      month = Number("01");
    }
    let to = new Date(`${year}-${month}-01`);
    if (
      req.query.month == "null" ||
      req.query.month == 0 ||
      req.query.month == "undefined"
    ) {
      from = new Date(`${year}-01-01`);
      to = new Date(`${year}-12-31`);
    }
    let data = {
      candidate: 0,
      OnBoarding: 0,
      scheduled: 0,
      hired: 0,
      rejected: 0,
      completed: 0,
    };
    const userId = req?.query?.userId;
    const user = await User.findOne({ id: userId }).populate("role");
    const InterviewStatus = ["scheduled", "hired", "rejected", "completed"];
    const fromDate = new Date(from);
    const toDate = new Date(to);
    const agencydiv = await Agency.findOne({ id: agencyId });
    const uniqueworld = await Agency.findOne({ email: "uniqueworldjobs@gmail.com" });

    let filterforagency = {};
    if (agencyId !== uniqueworld.id) {
      if (agencydiv?.permission?.dataMerge?.allAgency) {
        filterforagency = {
          $or: [
            { "agency.permission.dataMerge.allAgency": true },
            { "agency.id": agencydiv.id },
          ],
        };
      } else if (agencydiv?.permission?.dataMerge?.uniqueworld) {
        filterforagency = {
          $or: [{ "agency.id": agencyId }, { "agency.id": uniqueworld.id }],
        };
      } else {
        filterforagency = { "agency.id": agencyId };
      }
    }

    let cities = [];
    agencydiv?.permission?.areas?.forEach((item) => {
      item?.cities.forEach((ele) => {
        if (ele.city) {
          cities.push(ele?.city);
        }
      });
    });

    
  let pipelineCandidate = [];
  if (agencyId !== uniqueworld.id) {
    if (agencyId) {
      pipelineCandidate.push(
        {
          $match: {
            $expr: {
              $cond: {
                if: { $ne: ["$agencyId", agencyId] },
                then: {
                  $in: [
                    "$city",
                    {
                      $map: {
                        input: {
                          $filter: {
                            input: cities,
                            as: "city",
                            cond: {
                              $regexMatch: {
                                input: "$city",
                                regex: "$$city",
                                options: "i",
                              },
                            },
                          },
                        },
                        in: "$$this",
                      },
                    },
                  ],
                },
                else: true,
              },
            },
          },
        },
        {
          $match: { ...filterforagency },
        }
      );
    }
  }
  let objOfFilter = [];
  if (req.query.month != 0 || req.query.year != 0) {
    objOfFilter.push({
      $match: {
        createdAt: {
          $gte: new Date(fromDate),
          $lte: new Date(toDate),
        },
      },
    });
  }

    const candidatePromise = Candidate.aggregate([{
      $lookup: {
        from: "agency",
        localField: "agencyId",
        foreignField: "id",
        as: "agency",
      },
    },
    {
      $addFields: {
        agency: { $arrayElemAt: ["$agency", 0] },
      },
    },
    ...objOfFilter,
    ...pipelineCandidate,
    // ...pipline,
    {
      $count: "candidate",
    },
  ]).then((result) => {
      data.candidate = result.length > 0 ? result[0].candidate : 0;
    });

    const query = user?.role?.name === "Recruiter" ? { userId } : {};

    const interviewPromises = InterviewStatus.map((status) => {
      const pipeline = [
        {
          $lookup: {
            from: "interviewStatus",
            localField: "id",
            foreignField: "candidateid",
            as: "interviewStatu",
            pipeline: [
              {
                $sort: { interviewStatusUpdate: -1 },
              },
              {
                $match: { agencyId },
              },
            ],
          },
        },
        {
          $addFields: {
            interviewStatus: {
              $cond: {
                if: { $gt: [{ $size: "$interviewStatu" }, 0] },
                then: { $arrayElemAt: ["$interviewStatu.interviewStatus", 0] },
                else: "available",
              },
            },
          },
        },
        {
          $addFields: {
            interviewStatusUpdate: {
              $cond: {
                if: { $gt: [{ $size: "$interviewStatu" }, 0] },
                then: { $arrayElemAt: ["$interviewStatu.interviewStatusUpdate", 0] },
                else: "null",
              },
            },
          },
        },
        {
          $project: { interviewStatu: 0 },
        },
        {
          $match: {
            ...query,
            interviewStatus: status,
            // interviewStatusUpdate: {
            //   $gte: fromDate,
            //   $lte: toDate,
            // },
          },
        },
        {
          $count: "count",
        },
      ];

      return Candidate.aggregate(pipeline).then((response) => {
        if (response?.length > 0) data[status] = response[0]?.count;
      });
    });

    const queryOnboard = user?.role?.name === "Recruiter" ? { userId } : {};
    const filter2 = [];
    if (req.query.month != 0 || req.query.year != 0) {
      filter2.push({
        $match: {
          createdAt: {
            $gte: new Date(from),
            $lte: new Date(to),
          },
        },
      });
    }
    const onboardingPromise = OnBoarding.aggregate([
      {
        $match: { agencyId },
      },
      {
        $match: queryOnboard,
      },
      ...filter2,
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
        },
      },
    ]).then((response) => {
      if (response?.length > 0) data.OnBoarding = response[0]?.count;
    });

    await Promise.all([candidatePromise, ...interviewPromises, onboardingPromise]);    
    res.json({ ...data });
  } catch (error) {
    console.log("Dashboard statistics error", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

exports.recruitorsWork = async (req, res) => {
  let month = Number(req.query.month) + 1;
  let year = req.query.year;
  const from = new Date(`${year}-${month}-01`);
  month += 1;
  const agencyId = req.headers["agencyid"];
  if (Number(req.query.month) === 11) {
    year = Number(year) + 1;
    month = Number("01");
  }
  let to = new Date(`${year}-${month}-01`);

  const filter = [];
  if (req.query.month != 0 || req.query.year != 0) {
    if (req.query.month == 0) {
      to = new Date(`${year}-12-01`);
    }
    filter.push({
      $match: {
        interviewStatusUpdate: {
          $gte: from.toISOString(),
          $lte: to.toISOString(),
        },
      },
    });
  }

  try {
    let users = await User.aggregate([
      {
        $lookup: {
          from: "role",
          localField: "roleId",
          foreignField: "id",
          as: "role",
        },
      },
      {
        $match: { "role.name": "Recruiter" },
      },
      {
        $lookup: {
          from: "candidates",
          localField: "id",
          foreignField: "interviewerId",
          as: "candidates",
          pipeline: [
            {
              $lookup: {
                from: "interviewStatus",
                localField: "id",
                foreignField: "candidateid",
                as: "interviewStatu",
                pipeline: [
                  {
                    $match: {
                      agencyId: { $in: [agencyId] },
                    },
                  },
                ],
              },
            },
            {
              $addFields: {
                interviewStatus: {
                  $cond: {
                    if: { $gt: [{ $size: "$interviewStatu" }, 0] },
                    then: {
                      $arrayElemAt: ["$interviewStatu.interviewStatus", 0],
                    },
                    else: "available",
                  },
                },
              },
            },
            {
              $addFields: {
                interviewStatusUpdate: {
                  $cond: {
                    if: { $gt: [{ $size: "$interviewStatu" }, 0] },
                    then: {
                      $arrayElemAt: [
                        "$interviewStatu.interviewStatusUpdate",
                        0,
                      ],
                    },
                    else: "null",
                  },
                },
              },
            },
            ...filter,
            {
              $facet: {
                hired: [
                  {
                    $match: { interviewStatus: "hired" },
                  },
                  {
                    $count: "count",
                  },
                ],
                scheduled: [
                  {
                    $match: { interviewStatus: "scheduled" },
                  },
                  {
                    $count: "count",
                  },
                ],
                rejected: [
                  {
                    $match: { interviewStatus: "rejected" },
                  },
                  {
                    $count: "count",
                  },
                ],
              },
            },
            {
              $addFields: {
                rejected: { $arrayElemAt: ["$rejected", 0] },
              },
            },
            {
              $addFields: {
                scheduled: { $arrayElemAt: ["$scheduled", 0] },
              },
            },
            {
              $addFields: {
                hired: { $arrayElemAt: ["$hired", 0] },
              },
            },
          ],
        },
      },
      {
        $unwind: "$candidates",
      },
      {
        $group: {
          _id: "$_id",
          data: { $push: "$$ROOT" },
          hired: { $sum: "$candidates.hired.count" },
          scheduled: { $sum: "$candidates.scheduled.count" },
          rejected: { $sum: "$candidates.rejected.count" },
        },
      },
      {
        $unwind: "$data",
      },
      {
        $replaceWith: {
          $mergeObjects: [
            "$data",
            { hired: "$hired", scheduled: "$scheduled", rejected: "$rejected" },
          ],
        },
      },
      {
        $match: {
          $or: [
            { hired: { $gt: 0 } },
            { scheduled: { $gt: 0 } },
            { rejected: { $gt: 0 } },
          ],
        },
      },
      { $project: { candidates: 0, role: 0 } },
    ]);

    res.json(users);
  } catch (error) {
    console.log("dashboard graph", error);
  }
};

exports.interviews = async (req, res) => {
  const date = new Date();
  let year = date.getFullYear();
  const from = new Date(`${year}-01-01`);
  const to = new Date(`${year}-12-31`);
  const agencyId = req.headers["agencyid"];
  let data = [];

  try {
    const scheduledAggregation = await Interviews.aggregate([
      {
        $match: { agencyId: agencyId },
      },
      {
        $match: {
          createdAt: { $gte: from, $lte: to },
        },
      },
      {
        $lookup: {
          from: "candidates",
          localField: "candidateId",
          foreignField: "id",
          as: "candidates",
          pipeline: [
            {
              $lookup: {
                from: "interviewStatus",
                localField: "id",
                foreignField: "candidateid",
                as: "interviewStatu",
                pipeline: [
                  {
                    $match: {
                      agencyId: agencyId,
                    },
                  },
                ],
              },
            },
            {
              $addFields: {
                interviewStatus: {
                  $cond: {
                    if: { $gt: [{ $size: "$interviewStatu" }, 0] },
                    then: {
                      $arrayElemAt: ["$interviewStatu.interviewStatus", 0],
                    },
                    else: "available",
                  },
                },
              },
            },
          ],
        },
      },
      {
        $addFields: {
          candidates: { $arrayElemAt: ["$candidates", 0] },
        },
      },
      // {
      //   $unwind: "$candidates",
      // },
      {
        $match: { "candidates.interviewStatus": "scheduled" },
      },
      {
        $project: {
          month: { $month: { $toDate: "$createdAt" } },
          year: { $year: { $toDate: "$createdAt" } },
        },
      },
      {
        $group: {
          _id: {
            month: "$month",
            year: "$year",
          },
          count: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          month: "$_id.month",
          year: "$_id.year",
          count: 1,
        },
      },
      {
        $sort: {
          year: 1,
          month: 1,
        },
      },
    ]);

    const result = scheduledAggregation.map((item) => ({
      month: item.month,
      year: item.year,
      count: item.count,
    }));

    const monthlyArray = Array.from({ length: 12 }, () => "0");

    result.forEach((item) => {
      monthlyArray[item.month - 1] = String(item.count);
    });

    const scheduled = {
      scheduled: monthlyArray,
    };

    const hiredAggregation = await Interviews.aggregate([
      {
        $match: { agencyId: agencyId },
      },
      {
        $match: {
          createdAt: { $gte: from, $lte: to },
        },
      },
      {
        $lookup: {
          from: "candidates",
          localField: "candidateId",
          foreignField: "id",
          as: "candidates",
          pipeline: [
            {
              $lookup: {
                from: "interviewStatus",
                localField: "id",
                foreignField: "candidateid",
                as: "interviewStatu",
                pipeline: [
                  {
                    $match: {
                      agencyId: agencyId,
                    },
                  },
                ],
              },
            },
            {
              $addFields: {
                interviewStatus: {
                  $cond: {
                    if: { $gt: [{ $size: "$interviewStatu" }, 0] },
                    then: {
                      $arrayElemAt: ["$interviewStatu.interviewStatus", 0],
                    },
                    else: "available",
                  },
                },
              },
            },
          ],
        },
      },
      {
        $addFields: {
          candidates: { $arrayElemAt: ["$candidates", 0] },
        },
      },
      {
        $match: { "candidates.interviewStatus": "hired" },
      },
      {
        $project: {
          month: { $month: { $toDate: "$createdAt" } },
          year: { $year: { $toDate: "$createdAt" } },
        },
      },
      {
        $group: {
          _id: {
            month: "$month",
            year: "$year",
          },
          count: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          month: "$_id.month",
          year: "$_id.year",
          count: 1,
        },
      },
      {
        $sort: {
          year: 1,
          month: 1,
        },
      },
    ]);

    const resulthired = hiredAggregation.map((item) => ({
      month: item.month,
      year: item.year,
      count: item.count,
    }));

    const monthlyArrayhired = Array.from({ length: 12 }, () => "0");

    resulthired.forEach((item) => {
      monthlyArrayhired[item.month - 1] = String(item.count);
    });
    const hired = {
      hired: monthlyArrayhired,
    };

    const rejectedAggregation = await Interviews.aggregate([
      {
        $match: { agencyId: agencyId },
      },
      {
        $match: {
          createdAt: { $gte: from, $lte: to },
        },
      },
      {
        $lookup: {
          from: "candidates",
          localField: "candidateId",
          foreignField: "id",
          as: "candidates",
          pipeline: [
            {
              $lookup: {
                from: "interviewStatus",
                localField: "id",
                foreignField: "candidateid",
                as: "interviewStatu",
                pipeline: [
                  {
                    $match: {
                      agencyId: { $in: [agencyId] },
                    },
                  },
                ],
              },
            },
            {
              $addFields: {
                interviewStatus: {
                  $cond: {
                    if: { $gt: [{ $size: "$interviewStatu" }, 0] },
                    then: {
                      $arrayElemAt: ["$interviewStatu.interviewStatus", 0],
                    },
                    else: "available",
                  },
                },
              },
            },
          ],
        },
      },
      {
        $addFields: {
          candidates: { $arrayElemAt: ["$candidates", 0] },
        },
      },
      {
        $match: { "candidates.interviewStatus": "rejected" },
      },
      {
        $project: {
          month: { $month: { $toDate: "$createdAt" } },
          year: { $year: { $toDate: "$createdAt" } },
        },
      },
      {
        $group: {
          _id: {
            month: "$month",
            year: "$year",
          },
          count: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          month: "$_id.month",
          year: "$_id.year",
          count: 1,
        },
      },
      {
        $sort: {
          year: 1,
          month: 1,
        },
      },
    ]);

    const resultrejected = rejectedAggregation.map((item) => ({
      month: item.month,
      year: item.year,
      count: item.count,
    }));

    const monthlyArrayrejected = Array.from({ length: 12 }, () => "0");

    resultrejected.forEach((item) => {
      monthlyArrayrejected[item.month - 1] = String(item.count);
    });

    const rejected = {
      rejected: monthlyArrayrejected,
    };

    data.push(scheduled, hired, rejected);

    res.json(data);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

exports.todayInterviews = async (req, res) => {
  const userId = req?.query?.userId;
  const currentUser = req?.user;
  const date = moment().format("L");
  let query = {};
  const user = await User.findOne({ id: currentUser?.id }).populate("role");
  if (user?.role?.name === "Candidate") {
    const candidate = await Candidate.findOne({ userId: currentUser?.id });
    query["candidateId"] = candidate?.id;
  } else {
    if (userId?.length > 0) {
      query["userId"] = userId;
    }
  }
  const interviews = await Interviews.aggregate([
    {
      $sort: { createdAt: -1 },
    },
    {
      $match: { date: date },
    },
    { $match: query },
    {
      $lookup: {
        from: "candidates",
        localField: "candidateId",
        foreignField: "id",
        as: "candidates",
      },
    },
    {
      $addFields: {
        candidates: { $arrayElemAt: ["$candidates", 0] },
      },
    },
    {
      $lookup: {
        from: "clients",
        localField: "onBoardingId",
        foreignField: "id",
        as: "client",
      },
    },
    {
      $addFields: {
        client: { $arrayElemAt: ["$client", 0] },
        clientCompanyName: { $arrayElemAt: ["$client.companyName", 0] },
      },
    },
    {
      $match: { "candidates.interviewStatus": "scheduled" },
    },
  ]);
  res.json(interviews);
};

exports.candidates = async (req, res) => {
  const agencyId = req.headers["agencyid"];
  const userId2 = req.headers.userid;
  const basicDetails = req.body;
  // const agencydiv = await Agency.findOne({
  //   id: agencyId,
  // });
  // let cities = [];
  // agencydiv?.permission?.areas?.map((item) => {
  //   item?.cities.map((ele) => {
  //     if (ele.city) {
  //       cities.push(ele?.city);
  //     }
  //   });
  // });
  // let filterforagency = {};
  // const uniqueworld = await Agency.findOne({
  //   email: "uniqueworldjobs@gmail.com",
  // });

  // if (agencyId !== uniqueworld.id) {
  //   if (
  //     agencydiv?.permission?.dataMerge?.allAgency == true &&
  //     agencydiv?.permission?.dataMerge?.allAgency == true
  //   ) {
  //     filterforagency = {
  //       ...filterforagency,
  //       $or: [
  //         { "agency.permission.dataMerge.allAgency": true },
  //         { "agency.id": agencydiv.id },
  //       ],
  //     };
  //   } else if (
  //     agencydiv?.permission?.dataMerge?.uniqueworld == true &&
  //     agencydiv?.permission?.dataMerge?.allAgency == false
  //   ) {
  //     filterforagency = {
  //       ...filterforagency,
  //       $or: [{ "agency.id": agencyId }, { "agency.id": uniqueworld.id }],
  //     };
  //   } else if (
  //     agencydiv?.permission?.dataMerge?.allAgency == false &&
  //     agencydiv?.permission?.dataMerge?.allAgency == false
  //   ) {
  //     filterforagency = {
  //       ...filterforagency,
  //       "agency.id": agencyId,
  //     };
  //   }
  // }

  // let pipelineCandidate = [];
  // if (agencyId !== uniqueworld.id) {
  //   if (agencyId) {
  //     pipelineCandidate.push(
  //       {
  //         $match: {
  //           $expr: {
  //             $cond: {
  //               if: { $ne: ["$agencyId", agencyId] },
  //               then: {
  //                 $in: [
  //                   "$city",
  //                   {
  //                     $map: {
  //                       input: {
  //                         $filter: {
  //                           input: cities,
  //                           as: "city",
  //                           cond: {
  //                             $regexMatch: {
  //                               input: "$city",
  //                               regex: "$$city",
  //                               options: "i",
  //                             },
  //                           },
  //                         },
  //                       },
  //                       in: "$$this",
  //                     },
  //                   },
  //                 ],
  //               },
  //               else: true,
  //             },
  //           },
  //         },
  //       },
  //       {
  //         $match: { ...filterforagency },
  //       }
  //     );
  //   }
  // }
  const data = await Candidate.aggregate([
    {
      $sort: { status: 1 },
    },
    {
      $sort: { createdAt: -1 },
    },
    {
      $match: { agencyId: agencyId },
    },
    {
      $lookup: {
        from: "agency",
        localField: "agencyId",
        foreignField: "id",
        as: "agency",
      },
    },
    {
      $addFields: {
        agency: { $arrayElemAt: ["$agency", 0] },
      },
    },
    // ...pipelineCandidate,
    {
      $limit: 15,
    },
  ]);
  res.json(data);
};
