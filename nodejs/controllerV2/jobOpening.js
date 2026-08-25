const mongoose = require("mongoose");
const JobOpening = require("../models-v2/jobOpening_Mongoose");
const JobApplication = require("../models-v2/jobApplication_Mongoose");
const Candidates = require("../models-v2/candidates_Mongoose");
const Agency = require("../models-v2/agency_Mongooes");
const Users = require("../models-v2/users_Mongoose");
const moment = require("moment");
const Role = require("../models-v2/role_Mongoose");
const Clients = require("../models-v2/clients_Mongoose");

let enqueueEmailJob = async () => {};
try {
  ({ enqueueEmailJob } = require("../mq/emailProducer"));
} catch (e) {
  console.error("emailProducer load failed:", e?.message || e);
}

let generateJobDescription = async () => {
  const err = new Error(
    "Job description generator is not available on this server."
  );
  err.code = "API_CONFIG_NOT_SET";
  throw err;
};
let VALID_ACTIONS = [
  "generate",
  "regenerate",
  "improve",
  "short",
  "professional",
];
try {
  ({ generateJobDescription, VALID_ACTIONS } = require("../services/jobDescriptionGenerator"));
} catch (e) {
  console.error("jobDescriptionGenerator load failed:", e?.message || e);
}

let buildProfileCompletenessAddFieldsStages = () => [];
let getProfileCompletionMatchStage = () => null;
try {
  ({
    buildProfileCompletenessAddFieldsStages,
    getProfileCompletionMatchStage,
  } = require("../services/profileCompleteness"));
} catch (e) {
  console.error("profileCompleteness load failed:", e?.message || e);
}

let getInterviewStatusStages = () => [];
try {
  ({ getInterviewStatusStages } = require("../services/candidateQuickFilter"));
} catch (e) {
  console.error("candidateQuickFilter load failed:", e?.message || e);
}

const MATCH_SCORE_MAX_POINTS = 70;

const getMatchScoreMatchFilter = (filterValue) => {
  if (!filterValue && filterValue !== 0) return null;
  const normalized = String(filterValue).trim().toLowerCase();
  if (
    normalized === "100" ||
    normalized === "100%" ||
    normalized === "complete"
  ) {
    return { matchScore: 100 };
  }
  if (
    normalized === "above80" ||
    normalized === "above_80" ||
    normalized === ">80" ||
    normalized === "above 80%"
  ) {
    return { matchScore: { $gt: 80 } };
  }
  if (
    normalized === "above90" ||
    normalized === "above_90" ||
    normalized === ">90" ||
    normalized === "above 90%"
  ) {
    return { matchScore: { $gt: 90 } };
  }
  if (
    normalized === "above70" ||
    normalized === "above_70" ||
    normalized === ">70" ||
    normalized === "above 70%"
  ) {
    return { matchScore: { $gt: 70 } };
  }
  if (
    normalized === "above60" ||
    normalized === "above_60" ||
    normalized === ">60" ||
    normalized === "above 60%"
  ) {
    return { matchScore: { $gt: 60 } };
  }
  if (
    normalized === "below50" ||
    normalized === "below_50" ||
    normalized === "<50" ||
    normalized === "below 50%"
  ) {
    return { matchScore: { $lt: 50 } };
  }
  if (
    normalized === "below30" ||
    normalized === "below_30" ||
    normalized === "<30" ||
    normalized === "below 30%"
  ) {
    return { matchScore: { $lt: 30 } };
  }
  return null;
};

const getMatchScoreMatchStage = (filterValue) => {
  const match = getMatchScoreMatchFilter(filterValue);
  return match ? { $match: match } : null;
};

const buildBestMatchBaseFilter = (jobOpening) => {
  const filter = {};
  if (jobOpening?.jobCategoryId) {
    filter["professional.jobCategoryId"] = jobOpening.jobCategoryId;
  }
  if (jobOpening?.gender && jobOpening.gender !== "both") {
    filter.gender = new RegExp(`^${String(jobOpening.gender).trim()}$`, "i");
  }
  return filter;
};

const buildNewMatchBaseFilter = (jobOpening) => {
  const filter = {};
  if (jobOpening?.jobCategoryId) {
    filter["professional.jobCategoryId"] = jobOpening.jobCategoryId;
  }
  if (jobOpening?.gender && jobOpening.gender !== "both") {
    filter.gender = new RegExp(`^${String(jobOpening.gender).trim()}$`, "i");
  }
  if (jobOpening?.createdAt) {
    filter.createdAt = { $gte: new Date(jobOpening.createdAt) };
  }
  return filter;
};

const MATCH_DURATION_DAYS = {
  "1day": 1,
  "7days": 7,
  "30days": 30,
  "3months": 90,
  "6months": 180,
  "9months": 270,
  "12months": 365,
};

const applyMatchDurationFilter = (filter, matchDuration) => {
  if (!matchDuration || !MATCH_DURATION_DAYS[matchDuration]) return filter;
  const cutoff = new Date(
    Date.now() - MATCH_DURATION_DAYS[matchDuration] * 24 * 60 * 60 * 1000
  );
  const existingCreatedAt =
    filter.createdAt && typeof filter.createdAt === "object"
      ? filter.createdAt
      : {};
  return {
    ...filter,
    createdAt: { ...existingCreatedAt, $gte: cutoff },
  };
};

const getLatestInterviewLookupStages = (agencyId) => [
  {
    $lookup: {
      from: "interviews",
      localField: "id",
      foreignField: "candidateId",
      as: "candidateInterviews",
      pipeline: [
        { $match: { agencyId, isdeleted: 0 } },
        { $sort: { createdAt: -1 } },
        { $limit: 1 },
      ],
    },
  },
  {
    $addFields: {
      latestInterview: { $arrayElemAt: ["$candidateInterviews", 0] },
    },
  },
  { $project: { candidateInterviews: 0 } },
];

const getViewedByCurrentUserStages = (agencyId, userId) => {
  if (!agencyId || !userId) return [];
  const agencyIdStr = String(agencyId);
  const userIdStr = String(userId);
  return [
    {
      $lookup: {
        from: "viewCandidates",
        localField: "id",
        foreignField: "candidateid",
        as: "currentUserViews",
        pipeline: [
          {
            $match: {
              agencyId: agencyIdStr,
              userId: { $in: [userIdStr] },
            },
          },
        ],
      },
    },
    {
      $addFields: {
        viewedByCurrentUser: { $gt: [{ $size: "$currentUserViews" }, 0] },
      },
    },
    { $project: { currentUserViews: 0 } },
  ];
};

const runMatchCandidateQuery = async (req, res, matchType) => {
  try {
    const jobOpeningid = req.params.id;
    let page = Number(req.query.page) || 1;
    let perPage = Number(req.query.perPage) || 10;
    page -= 1;
    const sortBy = req.query.sortBy || "newToOld";
    const matchScoreFilter = req.query.matchScore || "";
    const profileCompletionFilter = req.query.profileCompletion || "";
    const matchDuration = req.query.matchDuration || "";

    const jobOpening = await JobOpening.findOne({ id: jobOpeningid });
    if (!jobOpening) {
      return res.status(404).json({ msg: "Job opening not found" });
    }

    const agencyId = req.headers["agencyid"];
    const userId = req.headers.userid || req.query.userId;
    const agencydiv = await Agency.findOne({ id: agencyId });
    const uniqueworld = await Agency.findOne({
      email: "uniqueworldjobs@gmail.com",
    });
    const filterforagency = buildAgencyMergeFilter(
      agencydiv,
      agencyId,
      uniqueworld
    );

    let filter =
      matchType === "new"
        ? buildNewMatchBaseFilter(jobOpening)
        : buildBestMatchBaseFilter(jobOpening);
    filter = applyMatchDurationFilter(filter, matchDuration);

    const matchScoreStage = getMatchScoreMatchStage(matchScoreFilter);
    const profileCompletionStage = getProfileCompletionMatchStage(
      profileCompletionFilter
    );
    const profileStages = buildProfileCompletenessAddFieldsStages();

    const pipeline = [
      { $match: filter },
      {
        $lookup: {
          from: "agency",
          localField: "agencyId",
          foreignField: "id",
          as: "agency",
          pipeline: [{ $project: { password: 0 } }],
        },
      },
      {
        $addFields: {
          agency: { $arrayElemAt: ["$agency", 0] },
        },
      },
      ...(Object.keys(filterforagency).length
        ? [{ $match: filterforagency }]
        : []),
      {
        $lookup: {
          from: "interviewRequest",
          localField: "id",
          foreignField: "candidateId",
          as: "interviewRequest",
          pipeline: [{ $sort: { createdAt: 1 } }],
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
                        { $subtract: [new Date(), "$$request.createdAt"] },
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
                        Number(process.env.INTERVIEW_REQUEST_DURATION) || 7,
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
      { $project: { interviewRequest: 0 } },
      ...getInterviewStatusStages(agencyId, null),
      ...getLatestInterviewLookupStages(agencyId),
      ...getViewedByCurrentUserStages(agencyId, userId),
      { $addFields: buildCandidateMatchScoreAddFields(jobOpening) },
      ...profileStages,
      ...(matchScoreStage ? [matchScoreStage] : []),
      ...(profileCompletionStage ? [profileCompletionStage] : []),
      buildBestMatchSortStage(sortBy),
      {
        $facet: {
          data: [{ $skip: page * perPage }, { $limit: perPage }],
          count: [{ $group: { _id: null, count: { $sum: 1 } } }],
        },
      },
    ];

    const matchCandidates = await Candidates.aggregate(pipeline);
    const result = {
      data: matchCandidates[0]?.data || [],
      count: matchCandidates[0]?.count?.[0]?.count || 0,
    };
    res.json({
      results: result.data,
      total: result.count,
    });
  } catch (error) {
    console.error(`${matchType}MatchCandidate error:`, error);
    res.status(500).json({
      msg: "Internal error",
    });
  }
};

const buildAgencyMergeFilter = (agencydiv, agencyId, uniqueworld) => {
  if (agencydiv?.permission?.dataMerge?.allAgency === true) {
    return {
      $or: [
        { "agency.permission.dataMerge.allAgency": true },
        { "agency.id": agencydiv.id },
      ],
    };
  }
  if (
    agencydiv?.permission?.dataMerge?.uniqueworld === true &&
    agencydiv?.permission?.dataMerge?.allAgency === false
  ) {
    return {
      $or: [{ "agency.id": agencyId }, { "agency.id": uniqueworld?.id }],
    };
  }
  if (
    agencydiv?.permission?.dataMerge?.allAgency === false &&
    agencydiv?.permission?.dataMerge?.uniqueworld === false
  ) {
    return { "agency.id": agencyId };
  }
  return {};
};

const buildCandidateMatchScoreAddFields = (jobOpening) => {
  const jobCategoryId = jobOpening?.jobCategoryId;
  const minExp = jobOpening?.minExperienceYears;
  const salaryStart = jobOpening?.salaryRangeStart;
  const salaryEnd = jobOpening?.salaryRangeEnd;
  const jobLocation = jobOpening?.jobLocation || "";
  const workType = jobOpening?.workType || "";

  const rawScore = {
    $add: [
      {
        $cond: [
          { $eq: ["$professional.jobCategoryId", jobCategoryId] },
          30,
          0,
        ],
      },
      {
        $cond: [
          {
            $and: [
              { $ne: [salaryStart, null] },
              { $ne: [salaryEnd, null] },
              { $gte: ["$professional.expectedsalary", salaryStart] },
              { $lte: ["$professional.expectedsalary", salaryEnd] },
            ],
          },
          20,
          0,
        ],
      },
      {
        $cond: [
          {
            $and: [
              { $ne: [minExp, null] },
              { $ne: [minExp, undefined] },
              {
                $eq: [
                  {
                    $convert: {
                      input: { $ifNull: ["$professional.experienceInyear", ""] },
                      to: "string",
                      onError: "",
                      onNull: "",
                    },
                  },
                  { $toString: minExp },
                ],
              },
            ],
          },
          10,
          0,
        ],
      },
      {
        $cond: [
          {
            $or: [
              { $eq: [jobLocation, null] },
              { $eq: [jobLocation, ""] },
              {
                $regexMatch: {
                  input: { $ifNull: ["$city", ""] },
                  regex: jobLocation,
                  options: "i",
                },
              },
            ],
          },
          5,
          0,
        ],
      },
      {
        $cond: [
          {
            $or: [
              { $eq: [workType, null] },
              { $eq: [workType, ""] },
              { $eq: ["$professional.workType", workType] },
            ],
          },
          5,
          0,
        ],
      },
    ],
  };

  return {
    matchScore: {
      $round: [
        {
          $multiply: [
            { $divide: [rawScore, MATCH_SCORE_MAX_POINTS] },
            100,
          ],
        },
        0,
      ],
    },
  };
};

const buildBestMatchSortStage = (sortBy) => {
  if (sortBy === "newToOld") {
    return { $sort: { createdAt: -1 } };
  }
  if (sortBy === "oldToNew") {
    return { $sort: { createdAt: 1 } };
  }
  return { $sort: { matchScore: -1, createdAt: -1 } };
};

/** Roles allowed to manage job openings (Admin / Staff / Client). */
const JOB_POSTING_ROLES = [
  "Admin",
  "Team Leader",
  "BDM",
  "Recruiter",
  "Staff",
  "Client",
];

/** Internal staff roles (not Admin, not Client). */
const STAFF_ROLES = ["Team Leader", "BDM", "Recruiter", "Staff"];

const VALID_POSTING_STATUSES = [
  "draft",
  "open",
  "published",
  "closed",
  "archived",
];

const getUserRoleName = (user) =>
  user?.role?.name || user?.roleName || "";

const canManageJobPosting = (user) =>
  JOB_POSTING_ROLES.includes(getUserRoleName(user));

const isStaffRole = (roleName) => STAFF_ROLES.includes(roleName);

const canAssignRecruiter = (roleName) => roleName === "Admin";

const canPublishOrArchive = (roleName) => roleName === "Admin";

const canCloseJob = (roleName) =>
  roleName === "Admin" || roleName === "Client" || isStaffRole(roleName);

// Same candidate pool as Best Match UI (category + gender + agency merge; no date cutoff).
const getBestMatchCandidatesForNotify = async (jobOpening, agencyIdFromHeaders) => {
  const agencydiv = agencyIdFromHeaders
    ? await Agency.findOne({ id: agencyIdFromHeaders })
    : null;
  const uniqueworld = await Agency.findOne({
    email: "uniqueworldjobs@gmail.com",
  });
  const filterforagency = buildAgencyMergeFilter(
    agencydiv,
    agencyIdFromHeaders,
    uniqueworld
  );
  const filter = buildBestMatchBaseFilter(jobOpening);

  return Candidates.aggregate([
    { $match: filter },
    {
      $lookup: {
        from: "agency",
        localField: "agencyId",
        foreignField: "id",
        as: "agency",
        pipeline: [{ $project: { password: 0 } }],
      },
    },
    {
      $addFields: {
        agency: { $arrayElemAt: ["$agency", 0] },
      },
    },
    ...(Object.keys(filterforagency).length
      ? [{ $match: filterforagency }]
      : []),
    { $addFields: buildCandidateMatchScoreAddFields(jobOpening) },
    {
      $project: {
        id: 1,
        email: 1,
        mobile: 1,
        firstname: 1,
        lastname: 1,
        agencyId: 1,
        city: 1,
        matchScore: 1,
        agency: 1,
      },
    },
  ]);
};

/**
 * Notify Best Match candidates via email and/or WhatsApp (same content as job create).
 * @param {object} jobOpening
 * @param {string|undefined} agencyIdFromHeaders
 * @param {{ notifyEmail?: boolean, notifyWhatsapp?: boolean }} options
 */
const notifyBestMatchCandidates = async (
  jobOpening,
  agencyIdFromHeaders,
  options = {}
) => {
  const notifyEmail = options.notifyEmail !== false;
  const notifyWhatsapp = options.notifyWhatsapp !== false;

  if (!notifyEmail && !notifyWhatsapp) {
    console.log(
      `Best Match notify skipped for job ${jobOpening?.id} (no channels selected).`
    );
    return;
  }

  const matchingCandidates = await getBestMatchCandidatesForNotify(
    jobOpening,
    agencyIdFromHeaders
  );

  if (!matchingCandidates || matchingCandidates.length === 0) {
    console.log(
      `No Best Match candidates for job ${jobOpening.id}. No email/WhatsApp sent.`
    );
    return;
  }

  let sendNewJobBestMatchWhatsapp = async () => ({ skipped: true });
  if (notifyWhatsapp) {
    try {
      ({ sendNewJobBestMatchWhatsapp } = require("../middleware/whatsappMSG/welcomeMessage"));
    } catch (wpRequireErr) {
      console.warn(
        "WhatsApp module load failed — email only:",
        wpRequireErr?.message || wpRequireErr
      );
    }
  }

  const gapMs = Number(process.env.WHATSAPP_MULTI_API_DELAY_MS);
  const betweenCandidatesMs =
    Number.isFinite(gapMs) && gapMs >= 0 ? gapMs : 1500;

  console.log(
    `Notifying ${matchingCandidates.length} Best Match candidate(s) for job ${jobOpening.id} (email=${notifyEmail}, whatsapp=${notifyWhatsapp})`
  );

  for (let i = 0; i < matchingCandidates.length; i += 1) {
    const candidate = matchingCandidates[i];

    if (notifyEmail && candidate.email) {
      try {
        await enqueueEmailJob("newJobOpeningAlert", {
          candidate: {
            firstname: candidate.firstname,
            lastname: candidate.lastname,
            email: candidate.email,
            agencySlug:
              candidate?.agency?.slug ||
              candidate?.agencySlug ||
              "uniqueworld",
          },
          emailTo: candidate.email,
          jobOpening: {
            id: jobOpening.id,
            designation: jobOpening.designation,
            jobLocation: jobOpening.jobLocation,
            minExperienceYears: jobOpening.minExperienceYears,
            salaryRangeStart: jobOpening.salaryRangeStart,
            salaryRangeEnd: jobOpening.salaryRangeEnd,
          },
        });
      } catch (emailErr) {
        console.error(
          `Email enqueue failed for ${candidate.email}:`,
          emailErr?.message || emailErr
        );
      }
    }

    if (notifyWhatsapp && candidate.mobile) {
      try {
        if (i > 0 && betweenCandidatesMs > 0) {
          await new Promise((r) => setTimeout(r, betweenCandidatesMs));
        }
        await sendNewJobBestMatchWhatsapp(candidate, jobOpening);
      } catch (wpErr) {
        console.error(
          `WhatsApp failed for candidate ${candidate.id}:`,
          wpErr?.message || wpErr
        );
      }
    }
  }

  console.log(
    `Best Match notify done for job ${jobOpening.id} (${matchingCandidates.length} candidates)`
  );
};

exports.createJobOpening = async (req, res) => {
  const data = req.body;
  try {
    if (!canManageJobPosting(req.user)) {
      return res.status(403).json({
        msg: "You do not have permission to create job openings.",
      });
    }

    if (!String(data?.designation || "").trim()) {
      return res.status(400).json({
        msg: "Job Title is required.",
      });
    }

    const roleName = getUserRoleName(req.user);
    const objectid = new mongoose.Types.ObjectId();
    const payload = {
      id: objectid,
      _id: objectid,
      ...data,
      postingStatus: data.postingStatus || "open",
    };

    // Staff jobs are treated as owned + assigned to themselves
    if (isStaffRole(roleName) && !payload.recruiterId) {
      payload.recruiterId = req.user?.id;
    }

    const newJobOpening = await JobOpening.create(payload);

    // Fetch client (for bannerImage, etc.) based on userId who posted the job
    // let client = null;
    // if (newJobOpening?.userId) {
    //   client = await Clients.findOne({ userId: newJobOpening.userId }).select(
    //     "bannerImage"
    //   );
    // }

    // // Send the response immediately to the client, including client details
    // const newJobOpeningObj =
    //   typeof newJobOpening.toObject === "function"
    //     ? newJobOpening.toObject()
    //     : newJobOpening;
    res.json(newJobOpening);

    // Asynchronously notify Best Match candidates (email + WhatsApp) after response.
    if (newJobOpening) {
      process.nextTick(async () => {
        try {
          await notifyBestMatchCandidates(
            newJobOpening,
            req.headers["agencyid"],
            { notifyEmail: true, notifyWhatsapp: true }
          );
        } catch (queueError) {
          console.error(
            `Error notifying Best Match candidates for job ${newJobOpening.id}:`,
            queueError
          );
        }
      });
    }

  } catch (error) {
    console.log("jobOpening create err", error);
    res.status(500).json({ msg: "Failed to create job opening" });
  }
};

exports.getOnJobOpening = async (req, res) => {
  try {
    let { page, perPage, userId } = req.query;
    page -= 1;

    const roleName = getUserRoleName(req.user);
    const authUserId = req.user?.id || userId;

    // Role-based visibility:
    // Admin → all jobs; Staff (Recruiter/TL/BDM) → own or assigned; Client → own
    let scopeMatch = { userId: userId };
    if (roleName === "Admin") {
      scopeMatch = {};
    } else if (isStaffRole(roleName)) {
      scopeMatch = {
        $or: [
          { userId: authUserId },
          { recruiterId: authUserId },
        ],
      };
    } else if (roleName === "Client") {
      scopeMatch = { userId: authUserId || userId };
    }

    const body = req.body || {};
    if (body.recruiterId) {
      scopeMatch = { ...scopeMatch, recruiterId: body.recruiterId };
    }
    if (body.jobCategoryId) {
      scopeMatch = { ...scopeMatch, jobCategoryId: body.jobCategoryId };
    }

    const jobOpeningFilter = await JobOpening.aggregate([
      {
        $sort: { hotvacancy: -1 },
      },
      {
        $match: scopeMatch,
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
          // Active/Inactive by age only — never overwrite postingStatus
          activityStatus: {
            $cond: {
              if: {
                $gte: [
                  {
                    $divide: [
                      { $subtract: [new Date(), "$hotvacancy"] },
                      24 * 60 * 60 * 1000,
                    ],
                  },
                  30,
                ],
              },
              then: "Inactive",
              else: "Active",
            },
          },
          status: {
            $cond: {
              if: {
                $gte: [
                  {
                    $divide: [
                      { $subtract: [new Date(), "$hotvacancy"] },
                      24 * 60 * 60 * 1000,
                    ],
                  },
                  30,
                ],
              },
              then: "Inactive",
              else: "Active",
            },
          },
          postingStatus: { $ifNull: ["$postingStatus", "open"] },
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
        $facet: {
          data: [
            { $skip: page * perPage },
            { $limit: Number(perPage) },
            {
              $lookup: {
                from: "jobapplications",
                localField: "id",
                foreignField: "jobOpeningId",
                as: "responses",
              },
            },
            {
              $addFields: {
                totalResponses: { $size: "$responses" },
                newResponses: {
                  $size: {
                    $filter: {
                      input: "$responses",
                      as: "res",
                      cond: { $eq: ["$$res.status", "applied"] },
                    },
                  },
                },
              },
            },
            {
              $unset: "responses",
            },
          ],
          count: [{ $count: "total" }],
        },
      },
    ]);
    res.json({
      results: jobOpeningFilter[0]?.data,
      total: jobOpeningFilter[0]?.count[0]?.total,
    });
  } catch (err) {
    console.log("dataa JobOpening filter errr", err);
    res.json({ msg: err });
  }
};

exports.findJobOpening = async (req, res) => {
  try {
    let { id } = req.query;
    console.log("id", id);
    const jobOpening = await JobOpening.aggregate([
      {
        $match: { id: id },
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
      // {
      //   $lookup: {
      //     from: "clients",
      //     localField: "userId",
      //     foreignField: "userId",
      //     as: "client",
      //     pipeline: [
      //       {
      //         $project: {
      //           companyowner: 1,
      //           companyName: 1,
      //           mobile: 1,
      //           email: 1,
      //           bannerImage: 1,
      //         },
      //       },
      //     ],
      //   },
      // },
      // {
      //   $addFields: {
      //     client: { $arrayElemAt: ["$client", 0] },
      //   },
      // },
    ]);
    res.json(jobOpening[0]);
  } catch (err) {
    console.log("dataa JobOpening  errr", err);
    res.json({ msg: err });
  }
};

exports.updateJobOpening = async (req, res) => {
  const { _id, ...data } = req.body;
  const id = req.params.id;
  try {
    if (!canManageJobPosting(req.user)) {
      return res.status(403).json({ msg: "You do not have permission to edit job openings." });
    }

    if (
      Object.prototype.hasOwnProperty.call(data, "designation") &&
      !String(data.designation || "").trim()
    ) {
      return res.status(400).json({ msg: "Job Title is required." });
    }

    const existing = await JobOpening.findOne({ id });
    if (!existing) {
      return res.status(404).json({ msg: "Job opening not found" });
    }

    const roleName = getUserRoleName(req.user);
    const authUserId = req.user?.id;
    const isOwner = existing.userId === authUserId;
    const isAssigned = existing.recruiterId === authUserId;

    // Admin: any job; Staff: own or assigned; Client: own only
    if (roleName === "Client" && !isOwner) {
      return res.status(403).json({ msg: "You can only edit your own jobs." });
    }
    if (
      isStaffRole(roleName) &&
      !isOwner &&
      !isAssigned
    ) {
      return res.status(403).json({ msg: "You can only edit your own or assigned jobs." });
    }
    // Client cannot permanently delete via update — closing is allowed via postingStatus
    if (roleName === "Client" && data.postingStatus === "archived") {
      return res.status(403).json({ msg: "Clients cannot archive jobs." });
    }

    await JobOpening.updateOne({ id: id }, { ...data });
    res.json({ msg: "success" });
  } catch (error) {
    res.json({ msg: "something went wrong" });
    console.log("JobOpening update err", error);
  }
};

exports.deleteJobOpening = async (req, res) => {
  const id = req.params.id;

  try {
    if (!canManageJobPosting(req.user)) {
      return res.status(403).json({ msg: "You do not have permission to delete job openings." });
    }

    const roleName = getUserRoleName(req.user);
    // Only Admin can hard-delete. Staff/Client should close instead.
    if (roleName !== "Admin") {
      return res.status(403).json({
        msg: "Only Admin can delete job openings. Close the job instead.",
      });
    }

    const findById = await JobOpening.findOne({ id: id });
    if (!findById) {
      return res.status(404).json({ msg: "Job opening not found" });
    }
    await JobOpening.deleteOne({ id: id });
    res.json({ msg: "success" });
  } catch (error) {
    console.log("JobOpening delete err", error);
    res.status(500).json({ msg: "Error deleting job opening" });
  }
};

exports.bestMatchCandidate = async (req, res) =>
  runMatchCandidateQuery(req, res, "best");

exports.newMatchCandidate = async (req, res) =>
  runMatchCandidateQuery(req, res, "new");
exports.hotvacancy = async (req, res) => {
  try {
    let { page, perPage } = req.query;
    let body = req.body;

    let filter = {};
    if (body.industries) {
      filter = {
        ...filter,
        "industries.id": { $in: body.industries },
      };
    }
    if (body.jobcategory) {
      filter = {
        ...filter,
        "jobCategory.id": { $in: body.jobcategory },
      };
    }
    if (body.salaryRangeStart) {
      filter = {
        ...filter,
        salaryRangeStart: Number(body.salaryRangeStart),
      };
    }
    if (body.salaryRangeEnd) {
      filter = {
        ...filter,
        salaryRangeEnd: Number(body.salaryRangeEnd),
      };
    }
    if (body.gender) {
      filter = {
        ...filter,
        gender: new RegExp(body.gender, "i"),
      };
    }
    if (body.qualification) {
      filter = {
        ...filter,
        qualification: new RegExp(body.qualification, "i"),
      };
    }
    if (body.work) {
      filter = {
        ...filter,
        workType: new RegExp(body.work, "i"),
      };
    }
    if (body.companyName) {
      filter = {
        ...filter,
        "clients.companyName": new RegExp(body.companyName, "i"),
      };
    }
    if (body.contactOwnerName) {
      filter = {
        ...filter,
        "clients.companyowner": new RegExp(body.contactOwnerName, "i"),
      };
    }
    if (body.contactOwnerEmail) {
      filter = {
        ...filter,
        "clients.email": new RegExp(body.contactOwnerEmail, "i"),
      };
    }
    page -= 1;
    const agencyId = req.headers["agencyid"];
    const clientRoleId = await Role.findOne({ name: "Client" });
    const clients = await Users.aggregate([
      {
        $match: { roleId: clientRoleId?.id },
      },
      {
        $match: { agencyId: agencyId },
      },
    ]);
    const clientsId = [];
    for (let i = 0; i < clients.length; i++) {
      clientsId.push(clients[i].id);
    }
    const jobOpening = await JobOpening.aggregate([
      {
        $sort: { hotvacancy: -1 },
      },
      {
        $match: { userId: { $in: clientsId } },
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
        $addFields: {
          status: {
            $cond: {
              if: {
                $gte: [
                  {
                    $divide: [
                      { $subtract: [new Date(), "$hotvacancy"] },
                      24 * 60 * 60 * 1000,
                    ],
                  },
                  30,
                ],
              },
              then: "Inactive",
              else: "Active",
            },
          },
          postingStatus: { $ifNull: ["$postingStatus", "open"] },
        },
      },
      {
        $match: { status: "Active" },
      },
      {
        $lookup: {
          from: "clients",
          localField: "userId",
          foreignField: "userId",
          as: "clients",
          pipeline: [
            {
              $project: {
                companyowner: 1,
                companyName: 1,
                mobile: 1,
                email: 1,
                // bannerImage: 1,
              },
            },
          ],
        },
      },
      {
        $addFields: {
          clients: { $arrayElemAt: ["$clients", 0] },
        },
      },
      {
        $match: { ...filter },
      },
      {
        $facet: {
          data: [
            {
              $skip: page * perPage,
            },
            {
              $limit: Number(perPage),
            },
            {
              $lookup: {
                from: "jobapplications",
                localField: "id",
                foreignField: "jobOpeningId",
                as: "responses",
              },
            },
            {
              $addFields: {
                totalResponses: { $size: "$responses" },
                newResponses: {
                  $size: {
                    $filter: {
                      input: "$responses",
                      as: "res",
                      cond: { $eq: ["$$res.status", "applied"] },
                    },
                  },
                },
              },
            },
            {
              $unset: "responses",
            },
          ],
          count: [{ $group: { _id: null, count: { $sum: 1 } } }],
        },
      },
    ]);
    const result = {
      data: jobOpening[0].data,
      count: jobOpening[0].count[0] ? jobOpening[0].count[0].count : 0,
    };
    res.json({
      results: result.data,
      total: result.count,
    });
  } catch (error) {
    res.status(200).json({
      msg: "Internal error",
    });
  }
};
exports.ActivateAgainJobopening = async (req, res) => {
  const id = req.query.id;
  try {
    if (!id) {
      return res.json({ msg: "Id is incorrect" });
    }
    const date = new Date(moment().format("YYYY-MM-DD HH:mm:ss"));
    await JobOpening.updateOne({ id: id }, { $set: { hotvacancy: date } });
    res.json({ msg: "success" });
  } catch (error) {
    res.json({ msg: "something failed" });
    console.log("JobOpening update error", error);
  }
};

exports.applyForJob = async (req, res) => {
  try {
    const { jobOpeningId } = req.body;
    const authUser = req.user; // Assuming authUser contains userId

    if (!authUser || !authUser.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const candidate = await Candidates.findOne({ userId: authUser.id });

    if (!candidate) {
      return res.status(404).json({ error: "Candidate profile not found" });
    }

    const jobOpening = await JobOpening.findOne({ id: jobOpeningId });

    if (!jobOpening) {
      return res.status(404).json({ error: "Job opening not found" });
    }

    // Admin/Recruiter posts: client is on jobOpening.clientId.
    // Client posts: client is linked via jobOpening.userId.
    let clientWhoPostedJob = null;
    if (jobOpening.clientId) {
      clientWhoPostedJob = await Clients.findOne({ id: String(jobOpening.clientId) });
    }
    if (!clientWhoPostedJob && jobOpening.userId) {
      clientWhoPostedJob = await Clients.findOne({ userId: String(jobOpening.userId) });
    }

    if (!clientWhoPostedJob) {
      return res.status(404).json({ error: "Client who posted this job not found" });
    }

    const existingApplication = await JobApplication.findOne({
      jobOpeningId: jobOpeningId,
      candidateId: candidate.id,
    });

    if (existingApplication) {
      return res.status(400).json({ error: "Already applied for this job" });
    }

    const objectId = new mongoose.Types.ObjectId();
    const newApplication = await JobApplication.create({
      id: objectId,
      _id: objectId,
      jobOpeningId: jobOpening.id,
      candidateId: candidate.id,
      clientId: clientWhoPostedJob.id, // Use the fetched client's ID here
      status: "applied",
    });

    // Fetch client details for email notification
    // Prefer real client.userId (for Client-owned jobs) over job poster (Admin)
    const clientForEmail = {
      ...clientWhoPostedJob.toObject(),
      userId: clientWhoPostedJob.userId || jobOpening.userId,
    };

    if (clientForEmail) {
      await enqueueEmailJob("candidateJobApplyAlert", {
        client: clientForEmail,
        candidate: candidate,
        jobTitle: jobOpening.designation ? jobOpening.designation : "your new job opening",
        emailTo: clientForEmail.email,
        jobOpeningId: jobOpeningId
      });
    }

    return res.status(200).json({ msg: "Job application successful", data: newApplication });
  } catch (err) {
    console.error("Error applying for job:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

exports.getJobApplicants = async (req, res) => {
  try {
    const jobOpeningId = req.params.jobOpeningId;
    const authUser = req.user;

    if (!authUser || !authUser.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Verify that the logged-in user is the client who posted the job
    const jobOpening = await JobOpening.findOne({ id: jobOpeningId });

    if (!jobOpening) {
      return res.status(404).json({ error: "Job opening not found" });
    }



    let { page, perPage } = req.query;
    page = parseInt(page) || 1;
    perPage = parseInt(perPage) || 10;

    // Backfill: candidates created from Applied page may have jobOpeningId
    // on the candidate doc without a JobApplication row
    try {
      const linkedCandidates = await Candidates.find({
        jobOpeningId: String(jobOpeningId),
      }).select("id");
      const clientWhoPostedJob =
        (jobOpening.clientId &&
          (await Clients.findOne({ id: String(jobOpening.clientId) }))) ||
        (jobOpening.userId &&
          (await Clients.findOne({ userId: String(jobOpening.userId) }))) ||
        null;
      const clientId = clientWhoPostedJob?.id || jobOpening.clientId || null;
      if (clientId && linkedCandidates?.length) {
        for (const cand of linkedCandidates) {
          const exists = await JobApplication.findOne({
            jobOpeningId: String(jobOpeningId),
            candidateId: String(cand.id),
          });
          if (!exists) {
            const appId = new mongoose.Types.ObjectId();
            await JobApplication.create({
              id: appId,
              _id: appId,
              jobOpeningId: String(jobOpeningId),
              candidateId: String(cand.id),
              clientId: String(clientId),
              status: "applied",
            });
          }
        }
      }
    } catch (backfillErr) {
      console.error(
        "getJobApplicants backfill error =>",
        backfillErr?.message || backfillErr
      );
    }

    const applicantsAggregate = await JobApplication.aggregate([
      { $match: { jobOpeningId: jobOpeningId } },
      {
        $lookup: {
          from: "candidates",
          localField: "candidateId",
          foreignField: "id",
          as: "candidateDetails",
        },
      },
      { $unwind: "$candidateDetails" },
      {
        $project: {
          _id: 0,
          id: "$id",
          jobOpeningId: "$jobOpeningId",
          candidateId: "$candidateId",
          status: "$status",
          appliedAt: "$createdAt",
          candidateName: { $concat: ["$candidateDetails.firstname", " ", "$candidateDetails.lastname"] },
          candidateEmail: "$candidateDetails.email",
          candidateMobile: "$candidateDetails.mobile",
          candidateResume: "$candidateDetails.resume",
          candidateGender: "$candidateDetails.gender",
          candidateProfessional: "$candidateDetails.professional",
          candidateIndustry: "$candidateDetails.industries_relation",
        },
      },
      { $sort: { appliedAt: -1 } },
      {
        $facet: {
          results: [{ $skip: (page - 1) * perPage }, { $limit: perPage }],
          total: [{ $count: "total" }]
        }
      }
    ]);

    const results = applicantsAggregate[0].results || [];
    const total = applicantsAggregate[0].total[0]?.total || 0;

    return res.status(200).json({ msg: "Job applicants fetched successfully", results, total, page, perPage });
  } catch (err) {
    console.error("Error fetching job applicants:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * AI Assisted Job Description Generator
 * Actions: generate | regenerate | improve | short | professional
 */
exports.generateJobDescriptionAi = async (req, res) => {
  try {
    if (!canManageJobPosting(req.user)) {
      return res.status(403).json({
        success: false,
        error: "You do not have permission to generate job descriptions.",
      });
    }

    const {
      action = "generate",
      jobTitle,
      experience,
      skills,
      industry,
      location,
      employmentType,
      salary,
      existingContent,
    } = req.body || {};

    if (!VALID_ACTIONS.includes(String(action || "").toLowerCase())) {
      return res.status(400).json({
        success: false,
        error: `Invalid action. Allowed: ${VALID_ACTIONS.join(", ")}`,
      });
    }

    if (!String(jobTitle || "").trim()) {
      return res.status(400).json({
        success: false,
        error: "Job Title is required.",
      });
    }

    const data = await generateJobDescription({
      action: String(action).toLowerCase(),
      jobTitle,
      experience,
      skills,
      industry,
      location,
      employmentType,
      salary,
      existingContent: existingContent || {},
    });

    return res.status(200).json({
      success: true,
      action: String(action).toLowerCase(),
      data,
    });
  } catch (err) {
    console.error("generateJobDescriptionAi error:", err);
    const status =
      err.code === "API_CONFIG_NOT_SET" ||
      err.code === "AI_API_KEY_INVALID" ||
      err.code === "AI_MODEL_INVALID" ||
      err.code === "VALIDATION_ERROR" ||
      err.code === "INVALID_ACTION"
        ? 400
        : err.code === "AI_RATE_LIMIT"
          ? 429
          : 500;

    return res.status(status).json({
      success: false,
      code: err.code || "AI_GENERATE_FAILED",
      error: err.message || "Failed to generate job description.",
    });
  }
};

/**
 * Publish / Close / Archive / Draft / Open
 */
exports.updateJobPostingStatus = async (req, res) => {
  try {
    const id = req.params.id;
    const postingStatus = String(req.body?.postingStatus || "").toLowerCase();
    const roleName = getUserRoleName(req.user);

    if (!VALID_POSTING_STATUSES.includes(postingStatus)) {
      return res.status(400).json({
        success: false,
        msg: `Invalid status. Allowed: ${VALID_POSTING_STATUSES.join(", ")}`,
      });
    }

    const existing = await JobOpening.findOne({ id });
    if (!existing) {
      return res.status(404).json({ success: false, msg: "Job opening not found" });
    }

    const authUserId = req.user?.id;
    const isOwner = existing.userId === authUserId;
    const isAssigned = existing.recruiterId === authUserId;

    if (!canManageJobPosting(req.user)) {
      return res.status(403).json({ success: false, msg: "Permission denied." });
    }

    if (postingStatus === "published" || postingStatus === "archived") {
      if (!canPublishOrArchive(roleName)) {
        return res.status(403).json({
          success: false,
          msg: "Only Admin can publish or archive jobs.",
        });
      }
    } else if (postingStatus === "closed") {
      if (!canCloseJob(roleName)) {
        return res.status(403).json({ success: false, msg: "Not allowed to close jobs." });
      }
      if (roleName === "Client" && !isOwner) {
        return res.status(403).json({ success: false, msg: "You can only close your own jobs." });
      }
      if (isStaffRole(roleName) && !isOwner && !isAssigned) {
        return res.status(403).json({
          success: false,
          msg: "You can only close your own or assigned jobs.",
        });
      }
    } else if (roleName === "Client" && !isOwner) {
      return res.status(403).json({
        success: false,
        msg: "You can only update your own jobs.",
      });
    } else if (isStaffRole(roleName) && !isOwner && !isAssigned) {
      return res.status(403).json({
        success: false,
        msg: "You can only update your own or assigned jobs.",
      });
    }

    const prevStatus = String(existing.postingStatus || "open").toLowerCase();
    const notifyEmail =
      req.body?.notifyEmail === true || req.body?.notifyEmail === "true";
    const notifyWhatsapp =
      req.body?.notifyWhatsapp === true || req.body?.notifyWhatsapp === "true";

    await JobOpening.updateOne({ id }, { postingStatus });

    // On publish: same Best Match email/WhatsApp as create — only channels admin selected.
    if (
      postingStatus === "published" &&
      prevStatus !== "published" &&
      (notifyEmail || notifyWhatsapp)
    ) {
      const jobForNotify =
        typeof existing.toObject === "function"
          ? { ...existing.toObject(), postingStatus: "published" }
          : { ...existing, postingStatus: "published" };

      process.nextTick(async () => {
        try {
          await notifyBestMatchCandidates(
            jobForNotify,
            req.headers["agencyid"],
            { notifyEmail, notifyWhatsapp }
          );
        } catch (notifyErr) {
          console.error(
            `Error notifying Best Match candidates on publish for job ${id}:`,
            notifyErr
          );
        }
      });
    }

    return res.status(200).json({
      success: true,
      msg: `Job ${postingStatus} successfully`,
      postingStatus,
    });
  } catch (err) {
    console.error("updateJobPostingStatus error:", err);
    return res.status(500).json({ success: false, msg: "Failed to update job status" });
  }
};

/**
 * Assign recruiter to a job (Admin only)
 */
exports.assignJobRecruiter = async (req, res) => {
  try {
    const id = req.params.id;
    const recruiterId = req.body?.recruiterId;
    const roleName = getUserRoleName(req.user);

    if (!canAssignRecruiter(roleName)) {
      return res.status(403).json({
        success: false,
        msg: "Only Admin can assign recruiters.",
      });
    }

    if (!recruiterId) {
      return res.status(400).json({
        success: false,
        msg: "recruiterId is required.",
      });
    }

    const existing = await JobOpening.findOne({ id });
    if (!existing) {
      return res.status(404).json({ success: false, msg: "Job opening not found" });
    }

    const recruiter = await Users.aggregate([
      { $match: { id: recruiterId } },
      {
        $lookup: {
          from: "role",
          localField: "roleId",
          foreignField: "id",
          as: "role",
        },
      },
      { $addFields: { role: { $arrayElemAt: ["$role", 0] } } },
      { $project: { id: 1, name: 1, "role.name": 1 } },
    ]);

    const recruiterUser = recruiter?.[0];
    if (!recruiterUser) {
      return res.status(404).json({ success: false, msg: "Recruiter user not found" });
    }

    const recruiterRole = recruiterUser?.role?.name;
    if (!isStaffRole(recruiterRole) && recruiterRole !== "Admin") {
      return res.status(400).json({
        success: false,
        msg: "Assigned user must be Staff, Recruiter, Team Leader, BDM, or Admin.",
      });
    }

    await JobOpening.updateOne({ id }, { recruiterId });
    return res.status(200).json({
      success: true,
      msg: "Recruiter assigned successfully",
      recruiterId,
      recruiterName: recruiterUser.name,
    });
  } catch (err) {
    console.error("assignJobRecruiter error:", err);
    return res.status(500).json({ success: false, msg: "Failed to assign recruiter" });
  }
};
