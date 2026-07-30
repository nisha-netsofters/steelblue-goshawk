/**
 * Quick-tab filters for the Candidates list.
 * Maps UI tab ids to Mongo match stages / early document filters.
 */

const RECENTLY_ADDED_DAYS = 30;
const RECENTLY_EDITED_DAYS = 30;

const IN_PROCESS_STATUSES = [
  "shortlisted",
  "trail",
  "reschedule",
  "CV Shared",
  "cv shared",
  "completed",
];

const STATUS_QUICK_FILTERS = [
  "inProcess",
  "interviewScheduled",
  "selected",
  "rejected",
  "hold",
];

const getDaysAgo = (days) =>
  new Date(Date.now() - days * 24 * 60 * 60 * 1000);

/**
 * Early $match on candidates collection (date-based tabs only).
 * Interview-status tabs are applied after interviewStatus lookup.
 */
function getQuickFilterEarlyMatch(quickFilter) {
  if (!quickFilter) return {};

  switch (quickFilter) {
    case "recentlyAdded":
      return { createdAt: { $gte: getDaysAgo(RECENTLY_ADDED_DAYS) } };
    case "newCandidates":
      return { updatedAt: { $gte: getDaysAgo(RECENTLY_EDITED_DAYS) } };
    default:
      return {};
  }
}

/**
 * Match on computed interviewStatus (after interviewStatus collection lookup).
 */
function getQuickFilterStatusMatch(quickFilter) {
  if (!quickFilter) return null;

  switch (quickFilter) {
    case "inProcess":
      return {
        interviewStatus: {
          $regex:
            /^(shortlisted|trail|reschedule|cv[\s_-]?shared|completed)$/i,
        },
      };
    case "interviewScheduled":
      return { interviewStatus: /^scheduled$/i };
    case "selected":
      return { interviewStatus: /^hired$/i };
    case "rejected":
      return { interviewStatus: /^rejected$/i };
    case "hold":
      return { interviewStatus: /^hold$/i };
    default:
      return null;
  }
}

/**
 * Stages after viewCandidates lookup / computed "new"|"view" status,
 * before $skip/$limit.
 */
function getQuickFilterPostViewStages(quickFilter, userId, agencyId) {
  const stages = [];
  if (!quickFilter) return stages;

  if (quickFilter === "favorites") {
    // Match by userId only — older saved rows may lack agencyId
    stages.push(
      {
        $lookup: {
          from: "savedCandidates",
          let: { cid: { $toString: "$id" } },
          pipeline: [
            {
              $match: {
                $expr: {
                  $eq: [{ $toString: "$candidateId" }, "$$cid"],
                },
                ...(userId ? { userId: String(userId) } : {}),
              },
            },
            { $limit: 1 },
          ],
          as: "_quickFavorite",
        },
      },
      {
        $match: {
          $expr: { $gt: [{ $size: "$_quickFavorite" }, 0] },
        },
      },
      {
        $project: { _quickFavorite: 0 },
      }
    );
  }

  if (quickFilter === "recentlyViewed") {
    stages.push({
      $match: {
        $expr: { $gt: [{ $size: "$viewCandidates" }, 0] },
      },
    });
  }

  return stages;
}

function quickFilterNeedsViewStages(quickFilter) {
  return (
    quickFilter === "recentlyViewed" ||
    quickFilter === "favorites"
  );
}

function quickFilterNeedsStatusStages(quickFilter) {
  return STATUS_QUICK_FILTERS.includes(quickFilter);
}

/**
 * Lookup latest interviewStatus and optionally $match for status tabs.
 * Must run before $skip/$limit when filtering by status.
 */
function getInterviewStatusStages(agencyId, quickFilter) {
  const stages = [
    {
      $lookup: {
        from: "interviewStatus",
        localField: "id",
        foreignField: "candidateid",
        as: "interviewStatu",
        pipeline: [
          { $sort: { createdAt: -1 } },
          {
            $match: {
              agencyId: { $in: [String(agencyId)] },
            },
          },
        ],
      },
    },
    {
      $addFields: {
        interviewStatusUpdate: {
          $cond: {
            if: { $gt: [{ $size: "$interviewStatu" }, 0] },
            then: {
              $arrayElemAt: ["$interviewStatu.interviewStatusUpdate", 0],
            },
            else: "null",
          },
        },
        interviewStatus: {
          $cond: {
            if: { $gt: [{ $size: "$interviewStatu" }, 0] },
            then: { $arrayElemAt: ["$interviewStatu.interviewStatus", 0] },
            else: {
              $ifNull: ["$interviewStatus", "available"],
            },
          },
        },
      },
    },
    {
      $project: { interviewStatu: 0 },
    },
  ];

  const statusMatch = getQuickFilterStatusMatch(quickFilter);
  if (statusMatch) {
    stages.push({ $match: statusMatch });
  }

  return stages;
}

function getCandidateViewStatusStages(quickFilter, userId, agencyId, date = new Date()) {
  if (!quickFilterNeedsViewStages(quickFilter)) return [];

  return [
    {
      $lookup: {
        from: "viewCandidates",
        localField: "id",
        foreignField: "candidateid",
        as: "viewCandidates",
        pipeline: [
          {
            $match: {
              userId: { $in: [userId] },
            },
          },
        ],
      },
    },
    {
      $addFields: {
        createdAtDifference: { $subtract: [date, "$createdAt"] },
      },
    },
    {
      $addFields: {
        status: {
          $switch: {
            branches: [
              {
                case: { $gt: [{ $size: "$viewCandidates" }, 0] },
                then: "view",
              },
              {
                case: {
                  $gte: ["$createdAtDifference", 15 * 24 * 60 * 60 * 1000],
                },
                then: "view",
              },
              {
                case: { $eq: [{ $size: "$viewCandidates" }, 0] },
                then: "new",
              },
            ],
            default: "new",
          },
        },
      },
    },
    ...getQuickFilterPostViewStages(quickFilter, userId, agencyId),
  ];
}

module.exports = {
  RECENTLY_ADDED_DAYS,
  RECENTLY_EDITED_DAYS,
  IN_PROCESS_STATUSES,
  STATUS_QUICK_FILTERS,
  getQuickFilterEarlyMatch,
  getQuickFilterStatusMatch,
  getQuickFilterPostViewStages,
  getCandidateViewStatusStages,
  quickFilterNeedsViewStages,
  quickFilterNeedsStatusStages,
  getInterviewStatusStages,
};
