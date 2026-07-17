const Candidates = require("../models-v2/candidates_Mongoose");
const Clients = require("../models-v2/clients_Mongoose");

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
