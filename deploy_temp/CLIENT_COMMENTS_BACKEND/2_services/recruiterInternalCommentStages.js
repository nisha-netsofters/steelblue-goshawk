const buildAgencyMatch = (agencyId) => {
  if (!agencyId && agencyId !== 0) return {};
  return { agencyId: String(agencyId) };
};

const buildCandidateMatch = (candidateIdField = "$id") => ({
  $expr: {
    $eq: [{ $toString: "$candidateId" }, { $toString: candidateIdField }],
  },
});

/**
 * Latest internal comment lookup for candidate lists.
 * When clientVisibleOnly is true, only comments marked visible to client are included.
 */
const getLatestInternalCommentStages = (
  agencyId,
  { clientVisibleOnly = false } = {}
) => {
  const commentMatch = {
    ...buildAgencyMatch(agencyId),
    isdeleted: 0,
  };
  if (clientVisibleOnly) {
    commentMatch.visibleToClient = true;
  }

  return [
    {
      $lookup: {
        from: "recruiterInternalComments",
        let: { candidateId: "$id" },
        pipeline: [
          {
            $match: {
              $expr: {
                $eq: [{ $toString: "$candidateId" }, { $toString: "$$candidateId" }],
              },
              ...commentMatch,
            },
          },
          { $sort: { createdAt: -1 } },
          { $limit: 1 },
          {
            $project: {
              comment: 1,
              authorName: 1,
              userId: 1,
              createdAt: 1,
              updatedAt: 1,
              visibleToClient: 1,
            },
          },
        ],
        as: "latestInternalComment",
      },
    },
    {
      $addFields: {
        latestInternalComment: { $arrayElemAt: ["$latestInternalComment", 0] },
      },
    },
  ];
};

/**
 * All client-visible internal comments for candidate cards.
 */
const getClientVisibleCommentsStages = (agencyId) => [
  {
    $lookup: {
      from: "recruiterInternalComments",
      let: { candidateId: "$id" },
      pipeline: [
        {
          $match: {
            $expr: {
              $eq: [{ $toString: "$candidateId" }, { $toString: "$$candidateId" }],
            },
            ...buildAgencyMatch(agencyId),
            isdeleted: 0,
            visibleToClient: true,
          },
        },
        { $sort: { createdAt: -1 } },
        {
          $project: {
            id: 1,
            comment: 1,
            authorName: 1,
            userId: 1,
            createdAt: 1,
          },
        },
      ],
      as: "clientVisibleComments",
    },
  },
];

module.exports = {
  buildAgencyMatch,
  buildCandidateMatch,
  getLatestInternalCommentStages,
  getClientVisibleCommentsStages,
};
