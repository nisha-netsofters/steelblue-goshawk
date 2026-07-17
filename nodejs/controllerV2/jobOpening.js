const mongoose = require("mongoose");
const JobOpening = require("../models-v2/jobOpening_Mongoose");
const JobApplication = require("../models-v2/jobApplication_Mongoose");
const Candidates = require("../models-v2/candidates_Mongoose");
const Agency = require("../models-v2/agency_Mongooes");
const Users = require("../models-v2/users_Mongoose");
const moment = require("moment");
const Role = require("../models-v2/role_Mongoose");
const { enqueueEmailJob } = require("../mq/emailProducer");
const Clients = require("../models-v2/clients_Mongoose");
const {
  generateJobDescription,
  VALID_ACTIONS,
} = require("../services/jobDescriptionGenerator");

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

// --- START: Extracted and adapted candidate matching logic ---
// This function consolidates candidate matching logic for email notifications.
// It leverages filtering similar to your existing `bestMatchCandidate` endpoint.
const getMatchingCandidatesForEmail = async (jobOpening, agencyIdFromHeaders) => {
  // Fetch agency details only if agencyId is provided in headers
  const agencydiv = agencyIdFromHeaders ? await Agency.findOne({ id: agencyIdFromHeaders }) : null;
  const uniqueworld = await Agency.findOne({ email: "uniqueworldjobs@gmail.com" });

  let filterforagency = {};
  if (agencydiv?.permission?.dataMerge?.allAgency === true) {
    filterforagency = {
      ...filterforagency,
      $or: [
        { "agency.permission.dataMerge.allAgency": true },
        { "agency.id": agencydiv.id },
      ],
    };
  } else if (agencydiv?.permission?.dataMerge?.uniqueworld === true) {
    filterforagency = {
      ...filterforagency,
      $or: [{ "agency.id": agencyIdFromHeaders }, { "agency.id": uniqueworld.id }],
    };
  } else if (agencyIdFromHeaders) {
    // If no specific merge permissions, just filter by the current agency
    filterforagency = {
      ...filterforagency,
      "agency.id": agencyIdFromHeaders,
    };
  }

  let filter = {};
  if (jobOpening?.jobLocation) {
    // Escape special regex characters to avoid runtime errors with values like "New York"
    const escapedLocation = jobOpening.jobLocation.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filter = {
      ...filter,
      city: new RegExp(escapedLocation, "i"), // only notify candidates in same city as job
    };
  }
  if (jobOpening) {
    filter = {
      ...filter,
      "professional.jobCategoryId": jobOpening?.jobCategoryId,
      "professional.experienceInyear": jobOpening?.minExperienceYears,
      "professional.expectedsalary": {
        $gte: jobOpening?.salaryRangeStart,
        $lte: jobOpening?.salaryRangeEnd,
      },
    };
  }
  if (jobOpening?.gender !== "both") {
    filter = {
      ...filter,
      gender: jobOpening?.gender,
    };
  }

  const matchingCandidates = await Candidates.aggregate([
    {
      $match: { ...filter }, // Initial match based on job criteria
    },
    {
      $lookup: {
        from: "agency",
        localField: "agencyId",
        foreignField: "id",
        as: "agency",
        pipeline: [
          {
            $project: { password: 0 },
          },
        ],
      },
    },
    {
      $addFields: {
        agency: { $arrayElemAt: ["$agency", 0] },
      },
    },
    // Apply agency-specific filtering if any rules were generated
    ...(Object.keys(filterforagency).length > 0 ? [{ $match: filterforagency }] : []),
    {
      $project: {
        id: 1,
        email: 1,
        firstname: 1,
        lastname: 1,
        "professional.jobCategoryId": 1,
        "professional.experienceInyear": 1,
        "professional.expectedsalary": 1,
        gender: 1,
        city: 1,
        agencyId: 1,
      },
    },
  ]);

  return matchingCandidates;
};
// --- END: Extracted and adapted candidate matching logic ---


exports.createJobOpening = async (req, res) => {
  const data = req.body;
  try {
    if (!canManageJobPosting(req.user)) {
      return res.status(403).json({
        msg: "You do not have permission to create job openings.",
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

    // Asynchronously enqueue email jobs after the response has been sent.
    if (newJobOpening) {
      process.nextTick(async () => {
        try {
          // Pass req.headers["agencyid"] to the new matching function
          const agencyId = req.headers["agencyid"];
          const matchingCandidates = await getMatchingCandidatesForEmail(newJobOpening, agencyId);

          if (matchingCandidates && matchingCandidates.length > 0) {
            for (const candidate of matchingCandidates) {
              if (candidate.email) {
                // Enqueue an email job for each matching candidate
                await enqueueEmailJob("newJobOpeningAlert", {
                  candidate: {
                    firstname: candidate.firstname,
                    lastname: candidate.lastname,
                    email: candidate.email,
                  },
                  emailTo: candidate.email,
                  jobOpening: {
                    id: newJobOpening.id,
                    designation: newJobOpening.designation,
                    jobLocation: newJobOpening.jobLocation,
                    minExperienceYears: newJobOpening.minExperienceYears,
                    salaryRangeStart: newJobOpening.salaryRangeStart,
                    salaryRangeEnd: newJobOpening.salaryRangeEnd,
                  },
                });
                console.log(`Enqueued email job for candidate ${candidate.email} for job ${newJobOpening.id}`);
              } else {
                console.warn(`Skipping email enqueue for candidate without email: ${candidate.id}`);
              }
            }
            console.log(`All email jobs enqueued for job opening ${newJobOpening.id}`);
          } else {
            console.log(`No matching candidates found for job opening ${newJobOpening.id}. No emails enqueued.`);
          }
        } catch (queueError) {
          console.error(`Error during asynchronous email job enqueue for job ${newJobOpening.id}:`, queueError);
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

exports.bestMatchCandidate = async (req, res) => {
  try {
    const jobOpeningid = req.params.id;
    let { page, perPage } = req.query;
    page -= 1;
    const jobOpening = await JobOpening.findOne({ id: jobOpeningid });
    const agencyId = req.headers["agencyid"];

    const agencydiv = await Agency.findOne({ id: agencyId });
    const uniqueworld = await Agency.findOne({
      email: "uniqueworldjobs@gmail.com",
    });
    let filterforagency = {};
    if (
      agencydiv?.permission?.dataMerge?.allAgency == true
    ) {
      filterforagency = {
        ...filterforagency,
        $or: [
          { "agency.permission.dataMerge.allAgency": true },
          { "agency.id": agencydiv.id },
        ],
      };
    } else if (
      agencydiv?.permission?.dataMerge?.uniqueworld == true &&
      agencydiv?.permission?.dataMerge?.allAgency == false
    ) {
      filterforagency = {
        ...filterforagency,
        $or: [{ "agency.id": agencyId }, { "agency.id": uniqueworld.id }],
      };
    } else if (
      agencydiv?.permission?.dataMerge?.allAgency == false &&
      agencydiv?.permission?.dataMerge?.allAgency == false
    ) {
      filterforagency = {
        ...filterforagency,
        "agency.id": agencyId,
      };
    }
    let filter = {};
    if (jobOpening) {
      filter = {
        ...filter,
        "professional.jobCategoryId": jobOpening?.jobCategoryId,
      };
      filter = {
        ...filter,
        "professional.experienceInyear": jobOpening?.minExperienceYears,
      };
      filter = {
        ...filter,
        "professional.expectedsalary": {
          $gte: jobOpening?.salaryRangeStart,
          $lte: jobOpening?.salaryRangeEnd,
        },
      };
    }
    if (jobOpening?.gender !== "both") {
      filter = {
        ...filter,
        gender: jobOpening?.gender,
      };
    }

    const bestMatchCandidates = await Candidates.aggregate([
      {
        $match: { ...filter },
      },
      {
        $lookup: {
          from: "agency",
          localField: "agencyId",
          foreignField: "id",
          as: "agency",
          pipeline: [
            {
              $project: { password: 0 },
            },
          ],
        },
      },
      {
        $addFields: {
          agency: { $arrayElemAt: ["$agency", 0] },
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
        $facet: {
          data: [
            {
              $skip: page * perPage,
            },
            {
              $limit: Number(perPage),
            },
          ],
          count: [{ $group: { _id: null, count: { $sum: 1 } } }],
        },
      },
    ]);
    const result = {
      data: bestMatchCandidates[0].data,
      count: bestMatchCandidates[0].count[0]
        ? bestMatchCandidates[0].count[0].count
        : 0,
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

    // Fetch the client using jobOpening.userId
    const clientWhoPostedJob = await Clients.findOne({ userId: jobOpening.userId });

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
    // The client object for email should contain the necessary fields, including userId for subscription check
    const clientForEmail = { ...clientWhoPostedJob.toObject(), userId: jobOpening.userId };

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
    } else if (!canManageJobPosting(req.user)) {
      return res.status(403).json({ success: false, msg: "Permission denied." });
    }

    await JobOpening.updateOne({ id }, { postingStatus });
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
