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
      return { interviewStatus: { $in: IN_PROCESS_STATUSES } };
    case "interviewScheduled":
      return { interviewStatus: "scheduled" };
    case "selected":
      return { interviewStatus: "hired" };
    case "rejected":
      return { interviewStatus: "rejected" };
    case "hold":
      return { interviewStatus: "hold" };
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
    stages.push(
      {
        $lookup: {
          from: "savedCandidates",
          localField: "id",
          foreignField: "candidateId",
          as: "_quickFavorite",
          pipeline: [
            {
              $match: {
                ...(userId ? { userId: String(userId) } : {}),
                ...(agencyId ? { agencyId: String(agencyId) } : {}),
              },
            },
          ],
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

  // New Candidates: never-viewed ("new") OR recently edited profiles
  if (quickFilter === "newCandidates") {
    const editedSince = getDaysAgo(RECENTLY_EDITED_DAYS);
    stages.push({
      $match: {
        $or: [
          { status: "new" },
          { updatedAt: { $gte: editedSince } },
        ],
      },
    });
  }

  return stages;
}

function quickFilterNeedsViewStages(quickFilter) {
  return (
    quickFilter === "recentlyViewed" ||
    quickFilter === "newCandidates" ||
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
              agencyId: { $in: [agencyId] },
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

module.exports = {
  RECENTLY_ADDED_DAYS,
  RECENTLY_EDITED_DAYS,
  IN_PROCESS_STATUSES,
  STATUS_QUICK_FILTERS,
  getQuickFilterEarlyMatch,
  getQuickFilterStatusMatch,
  getQuickFilterPostViewStages,
  quickFilterNeedsViewStages,
  quickFilterNeedsStatusStages,
  getInterviewStatusStages,
};
