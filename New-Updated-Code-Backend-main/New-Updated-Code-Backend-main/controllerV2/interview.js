const Interviews = require("../models-v2/interviews_Mongoose");
const Candidate = require("../models-v2/candidates_Mongoose");
const User = require("../models-v2/users_Mongoose");
const { default: mongoose } = require("mongoose");
const interviewStatus = require("../models-v2/interviewStatus_Mongoose");

exports.createInterviews = async (req, res) => {
  const data = { ...(req.body || {}) };
  const agencyId = req.headers["agencyid"];
  const userId2 = req.headers.userid;

  let interviewStatus = data?.candidate?.interviewStatus;
  if (interviewStatus === undefined) {
    interviewStatus = "scheduled";
  }
  const objectid = new mongoose.Types.ObjectId();
  interviewStatuscreate(
    interviewStatus,
    agencyId,
    userId2,
    data?.candidateId,
    objectid,
    req.body.onBoardingId
  );
  delete data?.interviewStatus;
  const interviewUserId = data?.userId || userId2;
  delete data?.id;
  delete data?._id;
  delete data?.agencyId;
  delete data?.userId;
  delete data?.isdeleted;

  try {
    const interview = await Interviews.create({
      ...data,
      id: objectid,
      _id: objectid,
      agencyId: agencyId,
      userId: interviewUserId,
      isdeleted: 0,
    });

    try {
      await Candidate.updateOne(
        { id: data?.candidateId },
        {
          $set: {
            interviews: await Interviews.findOne({ id: objectid }),
            interviewStatus,
            interviewerId: interviewUserId,
            interviewStatusUpdate: new Date().toISOString(),
          },
        }
      );
    } catch (candidateErr) {
      console.log("interview create candidate update err", candidateErr);
    }

    return res.json(interview);
  } catch (error) {
    console.log("interview create err", error);
    return res.status(500).json({ error: "Failed to create interview" });
  }
};

async function interviewStatuscreate(
  interviewStatusvar,
  agencyId,
  userId2,
  candidateId,
  interviewid,
  ClientId
) {
  const objectid = new mongoose.Types.ObjectId();
  try {
    await interviewStatus
      .create({
        id: objectid,
        _id: objectid,
        interviewStatus: interviewStatusvar,
        agencyId: agencyId,
        userId: userId2,
        candidateid: candidateId,
        interviewId: interviewid,
        ClientId: ClientId,
      })
      .then(() => {
        console.log("successfuly created interviewstatus");
      });
  } catch (error) {
    console.log("interview create err", error);
  }
}

exports.updateInterviews = async (req, res) => {
  const data = req.body;
  const InterviewsVar = await interviewStatus.findOne({
    interviewId: data?.id,
  });
  if (InterviewsVar) {
    await interviewStatus.updateOne(
      { id: InterviewsVar?.id },
      {
        $set: {
          interviewStatus: data?.candidate?.interviewStatus,
        },
      }
    );
  } else {
    const objectid = new mongoose.Types.ObjectId();
    await interviewStatus.create({
      id: objectid,
      _id: objectid,
      agencyId: data?.agencyId,
      candidateid: data?.candidateId,
      userId: data?.userId,
      interviewStatus: data?.candidate?.interviewStatus,
      interviewId: data.id,
    });
  }
  await Interviews.updateOne({ id: data?.id }, { ...data })
    .then(async (r) => {
      await Candidate.updateOne(
        { id: data?.candidateId },
        {
          interviewStatusUpdate: new Date().toISOString(),
          interviewStatus: data?.candidate?.interviewStatus,
        }
      );
      res.json({ msg: "success" });
    })
    .catch((err) => console.log("interview update", err));
};

exports.getInterviews = async (req, res) => {
  try {
    const interviewFilter = req.body;

    let { userId } = req.query;
    const page = Number(req.query?.page || 1);
    const perPage = Number(req.query?.perPage || 10);
    const skip = Number((page - 1) * perPage);
    const agencyId = req.headers["agencyid"];

    const field = ["onBoardingId", "candidateId", "userId"];
    let user = null;
    if (userId !== undefined) {
      user = await User.findOne({ id: userId }).populate("role");
    }
    var start,
      end = {};
    if (interviewFilter?.createdAt?.length > 0) {
      start = new Date(interviewFilter?.createdAt);
      start.setUTCHours(0, 0, 0, 0);

      end = new Date(interviewFilter?.createdAt);
      end.setUTCHours(23, 59, 59, 999);
    }

    const query = { isdeleted: 0 };
    if (
      userId?.length > 0 &&
      user?.role?.name === "Recruiter" &&
      userId !== undefined &&
      user !== null
    ) {
      query.userId = userId;
    }

    for (const key in interviewFilter) {
      if (field.includes(key)) {
        query[key] = interviewFilter[key];
      } else if (key === "scheduledby") {
        query.userId = interviewFilter[key];
      } else if (key === "createdAt") {
        query.createdAt = { $gte: start, $lte: end };
        query.createdAt = { $gte: start, $lte: end };
      } else if (key === "mobile") {
        query["candidate." + key] = interviewFilter[key];
      } else if (key === "interviewStatus") {
        // filter on interview wise status (from interviewStatus collection)
        query["interviewStatus"] = interviewFilter[key];
      } else if (key === "firstname") {
        query["candidate." + key] = {
          $regex: new RegExp(interviewFilter[key], "i"),
        };
      } else {
        query[key] = {
          $regex: new RegExp(interviewFilter[key], "i"),
        };
      }
    }
    console.log("query", query);
    const interviewsFilter = await Interviews.aggregate([
      {
        $sort: { createdAt: -1 },
      },
      {
        $match: { agencyId: agencyId },
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
        $lookup: {
          from: "candidates",
          localField: "candidateId",
          foreignField: "id",
          as: "candidate",
        },
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
        $lookup: {
          from: "clients",
          localField: "onBoardingId",
          foreignField: "id",
          as: "client",
        },
      },
      {
        // get latest interview status from interviewStatus collection per interview
        $lookup: {
          from: "interviewStatus",
          localField: "id",
          foreignField: "interviewId",
          as: "interviewStatusDocs",
          pipeline: [
            {
              $sort: { interviewStatusUpdate: -1, createdAt: -1 },
            },
            { $limit: 1 },
          ],
        },
      },
      // { $match: query },
      // { $unwind: "$candidate" },
      {
        $addFields: {
          users: { $arrayElemAt: ["$users", 0] },
          candidate: { $arrayElemAt: ["$candidate", 0] },
          onBoarding: { $arrayElemAt: ["$onBoarding", 0] },
          client: { $arrayElemAt: ["$client", 0] },
          interviewStatus: {
            $ifNull: [
              {
                $arrayElemAt: ["$interviewStatusDocs.interviewStatus", 0],
              },
              "$candidate.interviewStatus",
            ],
          },
        },
      },
      { $match: query },
      {
        $facet: {
          data: [{ $skip: skip }, { $limit: Number(perPage) }],
          count: [{ $count: "total" }],
        },
      },
    ]);

    res.json({
      results: interviewsFilter[0]?.data,
      total: interviewsFilter[0]?.count[0]?.total,
    });
  } catch (err) {
    console.log("dataa interviews filter errr", err);
    res.json({ msg: err });
  }
};

exports.deleteInterviews = async (req, res) => {
  const id = req.params.id;
  const interviewVar = await Interviews.findOne({ id: id });
  const agencyId = req.headers["agencyid"];
  await Candidate.updateOne(
    {
      id: interviewVar?.candidateId,
    },
    {
      $unset: { interviews: "" },
    }
  );
  
  const interviewStatusVar = await interviewStatus.aggregate([
    {
      $match: {
        candidateid: interviewVar?.candidateId,
        userId: interviewVar?.userId,
        agencyId: agencyId,
      },
    },
  ]);
  if (interviewStatusVar.length > 0) {
    await interviewStatus.deleteOne({ id: interviewStatusVar[0].id });
  }
  await Interviews.findOneAndDelete({ id })
    .then(async (r) => {
      await Candidate.updateOne(
        { id: r.candidateId },
        {
          interviewStatus: "available",
          interviewerId: null,
        },
        {
          $unset: { interviews: 1 },
        }
      ).then(res.json({ msg: "success" }));
    })
    .catch((err) => console.log("interview delete", err));
};

