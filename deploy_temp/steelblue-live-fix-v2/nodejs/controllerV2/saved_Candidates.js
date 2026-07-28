const mongoose = require("mongoose");
const Candidates = require("../models-v2/candidates_Mongoose");
const Clients = require("../models-v2/clients_Mongoose");
const Saved_candidates = require("../models-v2/savedCandidates_Mongoose");

exports.toggleFavoriteCandidate = async (req, res) => {
  try {
    const { candidateId } = req.body;
    const userId =
      req.headers.userid ||
      req.headers.userId ||
      req.user?.id ||
      req.user?.userId;
    const agencyId =
      req.headers["agencyid"] ||
      req.headers.agencyId ||
      req.user?.agencyId;

    if (!candidateId || !userId) {
      return res.status(400).json({ msg: "candidateId is required" });
    }

    const matchQuery = {
      candidateId: String(candidateId),
      userId: String(userId),
    };
    if (agencyId) {
      matchQuery.agencyId = String(agencyId);
    }

    const existing = await Saved_candidates.findOne(matchQuery);

    if (existing) {
      await Saved_candidates.deleteOne({
        $or: [{ id: String(existing.id) }, { _id: existing._id }],
      });
      return res.status(200).json({
        isSaved: false,
        msg: "Removed from favorites",
      });
    }

    const objectid = new mongoose.Types.ObjectId();
    const savedCandidate = await Saved_candidates.create({
      id: String(objectid),
      _id: objectid,
      candidateId: String(candidateId),
      userId: String(userId),
      ...(agencyId ? { agencyId: String(agencyId) } : {}),
    });

    return res.status(200).json({
      isSaved: true,
      savedCandidate,
      msg: "Added to favorites",
    });
  } catch (err) {
    console.info("toggleFavoriteCandidate =>", err);
    return res.status(500).json({ msg: "Something went wrong" });
  }
};

exports.SavedCandidate = async (req, res) => {
  let { page, perPage } = req.query;
  let { userId } = req.body;
  const client = await Clients.findOne({
    userId: userId,
  });
  page -= 1;
  try {
    const candidate = await Candidates.aggregate([
      {
        $sort: { createdAt: -1 },
      },
      {
        $lookup: {
          from: "savedCandidates",
          localField: "id",
          foreignField: "candidateId",
          as: "savedCandidates",
          pipeline: [
            {
              $match: { userId: userId },
            },
          ],
        },
      },
      {
        $lookup: {
          from: "interviewRequest",
          localField: "id",
          foreignField: "candidateId",
          as: "interviewRequest",
          pipeline: [
            {
              $sort: { createdAt: 1 },
            },
            {
              $match: { clientId: client?.id },
            },
          ],
        },
      },
      {
        $addFields: {
          interviewRequest: {
            $map: {
              input: "$interviewRequest",
              as: "request",
              in: {
                $mergeObjects: [
                  "$$request",
                  {
                    days: {
                      $divide: [
                        {
                          $subtract: [new Date(), "$$request.createdAt"],
                        },
                        1000 * 3600 * 24,
                      ],
                    },
                  },
                ],
              },
            },
          },
        },
      },
      {
        $addFields: {
          interviewRequest: {
            $map: {
              input: "$interviewRequest",
              as: "request",
              in: {
                $mergeObjects: [
                  "$$request",
                  {
                    isdisabled: {
                      $lte: [
                        "$$request.days",
                        process.env.INTERVIEW_REQUEST_DURATION,
                      ],
                    },
                  },
                ],
              },
            },
          },
        },
      },
      {
        $addFields: {
          interview_request: { $arrayElemAt: ["$interviewRequest", 0] },
        },
      },
      {
        $project: { interviewRequest: 0 },
      },
      {
        $unwind: "$savedCandidates",
      },
      {
        $facet: {
          data: [{ $skip: page * perPage }, { $limit: Number(perPage) }],
          count: [{ $count: "total" }],
        },
      },
    ]);
    res.json({
      results: candidate[0]?.data,
      total: candidate[0]?.count[0]?.total || 0,
    });
  } catch (err) {
    res.json({ msg: "Something went wrong" });
    console.info("-------------------------------");
    console.info(" industriesWisedCandidates=> ", err);
    console.info("-------------------------------");
  }
};
