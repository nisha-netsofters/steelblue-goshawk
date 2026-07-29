const Candidates = require("../models-v2/candidates_Mongoose");
const Industries = require("../models-v2/industries_Mongoose");
const {
  sendBulkMail,
  sendcandidateRegistrationSuccessfully,
  newCandidatewelcomeEmail,
  sendtoAllClientmailAdded,
  sendCandidateLoginCredentials,
} = require("../middleware/Emails/email");
const { awsUploadFiles } = require("../middleware/awsS3");
const { raw } = require("objection");
const { sendWhatsappMSG } = require("../middleware/whatsappMSG/whatsapp");
const { sendWelcomeWhatsapp } = require("../middleware/whatsappMSG/welcomeMessage");
const Professional = require("../models-v2/professional_Mongoose");
const mongoose = require("mongoose");
const JobCategory = require("../models-v2/jobCategory_Mongoose");
const Users = require("../models-v2/users_Mongoose");
const InterviewRequest = require("../models-v2/interviewRequest_Mongoose");
const agency = require("../models-v2/agency_Mongooes");
const { json } = require("body-parser");
const Agency = require("../models-v2/agency_Mongooes");
const viewCandidates = require("../models-v2/viewCandidates_Mongoose");
const moment = require("moment");
const interviewStatus = require("../models-v2/interviewStatus_Mongoose");
const { interviews } = require("./dashboard");
const Interviews = require("../models-v2/interviews_Mongoose");
const Clients = require("../models-v2/clients_Mongoose");
const Subscription = require("../models-v2/subscriptions_Mongoose");
const Orderofpayments = require("../models-v2/orderOfPayments_Mongoose");
const Role = require("../models-v2/role_Mongoose");
const bcrypt = require("bcryptjs");
const { enqueueEmailJob } = require("../mq/emailProducer");
const JobOpening = require("../models-v2/jobOpening_Mongoose");
const JobApplication = require("../models-v2/jobApplication_Mongoose");
const ResumeEnquiry = require("../models-v2/resumeEnquiry_Mongoose");
const {
  calculateProfileCompleteness,
  buildProfileCompletenessAddFieldsStages,
  getProfileCompletionMatchStage,
} = require("../services/profileCompleteness");
const {
  getQuickFilterEarlyMatch,
  getQuickFilterStatusMatch,
  getQuickFilterPostViewStages,
  quickFilterNeedsViewStages,
  quickFilterNeedsStatusStages,
  getInterviewStatusStages,
} = require("../services/candidateQuickFilter");
const {
  getClientVisibleCommentsStages,
  getLatestInternalCommentStages,
} = require("../services/recruiterInternalCommentStages");

/**
 * Candidate self statistics (lifetime) for candidate login.
 *
 * Returns counts that are scoped only to the logged‑in candidate:
 * - profileCompleteness: 0–100 based on key profile fields filled
 * - onboardedJobs: number of distinct onboarded jobs the candidate has been associated with
 * - totalInterviews / interviewsScheduled / interviewsAttended
 * - hired / rejected / reviewPending
 * - jobsApplied / jobMatches / pendingInterviewRequests
 *
 * Authentication: requires `verifyAuth` middleware.
 * Assumes `req.user` is a Users document with populated `role` and `agencyId`.
 */
exports.getCandidateSelfStatistics = async (req, res) => {
  try {
    const authUser = req.user;
    const candidateIdParam = req.params.candidateId;

    if (!authUser || !authUser.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Ensure only Candidate role can access this endpoint
    if (!authUser.role || authUser.role.name !== "Candidate") {
      return res.status(403).json({ error: "Access denied" });
    }

    const agencyId = authUser.agencyId;

    // ---------- Resolve candidate ----------
    const candidateQuery = candidateIdParam
      ? {
        id: candidateIdParam,
        ...(agencyId ? { agencyId } : {}),
      }
      : {
        userId: authUser.id,
        ...(agencyId ? { agencyId } : {}),
      };

    // Fields required for profile completeness must match services/profileCompleteness.js
    const candidate = await Candidates.findOne(candidateQuery)
      .select(
        "id userId agencyId firstname lastname mobile alternateMobile email gender state stateId city cityId resume professional industries_relation jobOpeningId"
      )
      .lean();

    if (!candidate) {
      return res.status(404).json({ error: "Candidate profile not found" });
    }

    // Normalize ID to string for consistent querying
    const candidateId = String(candidate.id);

    // ---------- Profile completeness (weighted mandatory sections) ----------
    const professional = candidate.professional || {};
    const {
      profileCompleteness,
      profileCompletenessLabel,
      profileCompletenessBreakdown,
    } = calculateProfileCompleteness(candidate);

    // ---------- Derived fields for job matching logic ----------
    const jobCategoryId = professional.jobCategoryId;
    const industriesId = candidate.industries_relation?.[0]?.industriesId;
    const expectedSalary = professional.expectedsalary || 0;

    const candidateExperience = (() => {
      const exp = professional.experienceInyear;
      if (!exp || typeof exp !== "string") return 0;
      const match = exp.match(/^(\d+(\.\d+)?)/);
      if (match) {
        return parseFloat(match[1]);
      }
      const asNum = parseFloat(exp);
      return Number.isNaN(asNum) ? 0 : asNum;
    })();

    const preferredLocation = professional.preferedJobLocation || "";
    const candidateWorkType = professional.workType || "";

    // ---------- Parallel statistics queries for this candidate ----------
    const [
      interviewStatusAggRaw,
      candidateInterviews,
      jobsAppliedCount,
      pendingInterviewRequestsCount,
      jobMatchesCount,
    ] = await Promise.all([
      // Grouped counts of interview statuses for this candidate
      (async () => {
        const statusQuery = {
          candidateid: candidateId,
          ...(agencyId ? { agencyId } : {}),
        };

        try {
          return await interviewStatus.aggregate([
            { $match: statusQuery },
            {
              $group: {
                _id: "$interviewStatus",
                count: { $sum: 1 },
              },
            },
          ]);
        } catch (err) {
          console.error(
            "getCandidateSelfStatistics: interviewStatus aggregate error",
            err
          );
          return [];
        }
      })(),

      // All interviews scheduled for this candidate (lifetime)
      (async () => {
        const baseQuery = {
          candidateId,
          ...(agencyId ? { agencyId } : {}),
        };

        try {
          let count = await Interviews.countDocuments(baseQuery);

          // If no interviews found, try again with string conversion safeguard
          if (count === 0) {
            const altQuery = {
              candidateId: candidateId.toString(),
              ...(agencyId ? { agencyId } : {}),
            };
            count = await Interviews.countDocuments(altQuery);
          }

          return count;
        } catch (err) {
          console.error(
            "getCandidateSelfStatistics: Interviews.countDocuments error",
            err
          );
          return 0;
        }
      })(),

      // Jobs applied (job applications where this candidate has a jobOpeningId)
      (async () => {
        try {
          return await JobApplication.countDocuments({
            candidateId,
            jobOpeningId: { $exists: true, $ne: null, $ne: "" },
            // If agency scoping is needed later, it can be added here.
          });
        } catch (err) {
          console.error(
            "getCandidateSelfStatistics: JobApplication.countDocuments error",
            err
          );
          return 0;
        }
      })(),

      // Pending interview requests
      (async () => {
        try {
          return await InterviewRequest.countDocuments({
            candidateId,
            ...(agencyId ? { agencyId } : {}),
          });
        } catch (err) {
          console.error(
            "getCandidateSelfStatistics: InterviewRequest.countDocuments error",
            err
          );
          return 0;
        }
      })(),

      // Job matches based on same matching logic used in `candidateJobMatching`
      (async () => {
        // If we don't even know the candidate's job category or industry,
        // we can't reliably compute job matches.
        if (!jobCategoryId && !industriesId) {
          return 0;
        }

        try {
          const jobActiveDays = Number(process.env.JOB_ACTIVE_DAYS) || 30;

          const matchConditions = {
            $and: [
              {
                $expr: {
                  $eq: [
                    {
                      $cond: {
                        if: {
                          $gte: [
                            {
                              $divide: [
                                { $subtract: [new Date(), "$hotvacancy"] },
                                24 * 60 * 60 * 1000 * jobActiveDays,
                              ],
                            },
                            jobActiveDays,
                          ],
                        },
                        then: "Inactive",
                        else: "Active",
                      },
                    },
                    "Active",
                  ],
                },
              },
            ],
          };

          // Industry and category matching (core requirements)
          if (jobCategoryId) {
            matchConditions.$and.push({ jobCategoryId });
          }
          if (industriesId) {
            matchConditions.$and.push({ industriesId });
          }

          const result = await JobOpening.aggregate([
            {
              $addFields: {
                status: {
                  $cond: {
                    if: {
                      $gte: [
                        {
                          $divide: [
                            { $subtract: [new Date(), "$hotvacancy"] },
                            24 * 60 * 60 * 1000 * jobActiveDays,
                          ],
                        },
                        jobActiveDays,
                      ],
                    },
                    then: "Inactive",
                    else: "Active",
                  },
                },
                // Basic compatibility scoring (not used for filtering, only for future ranking)
                matchScore: {
                  $add: [
                    // Industry match (30)
                    { $cond: [{ $eq: ["$industriesId", industriesId] }, 30, 0] },
                    // Job category match (30)
                    { $cond: [{ $eq: ["$jobCategoryId", jobCategoryId] }, 30, 0] },
                    // Salary compatibility (20)
                    {
                      $cond: [
                        {
                          $or: [
                            {
                              $and: [
                                { $lte: ["$salaryRangeStart", expectedSalary] },
                                { $gte: ["$salaryRangeEnd", expectedSalary] },
                              ],
                            },
                            { $eq: ["$negotiable", "yes"] },
                          ],
                        },
                        20,
                        0,
                      ],
                    },
                    // Experience compatibility (10)
                    {
                      $cond: [
                        {
                          $or: [
                            { $eq: ["$minExperienceYears", null] },
                            { $eq: ["$minExperienceYears", ""] },
                            {
                              $let: {
                                vars: {
                                  minExp: {
                                    $convert: {
                                      input: "$minExperienceYears",
                                      to: "double",
                                      onError: 0,
                                      onNull: 0,
                                    },
                                  },
                                },
                                in: { $lte: ["$$minExp", candidateExperience] },
                              },
                            },
                          ],
                        },
                        10,
                        0,
                      ],
                    },
                    // Location compatibility (5, fuzzy)
                    {
                      $cond: [
                        {
                          $or: [
                            { $eq: ["$jobLocation", null] },
                            { $eq: ["$jobLocation", ""] },
                            preferredLocation
                              ? {
                                $regexMatch: {
                                  input: "$jobLocation",
                                  regex: new RegExp(preferredLocation, "i"),
                                },
                              }
                              : { $literal: true },
                          ],
                        },
                        5,
                        0,
                      ],
                    },
                    // Work type compatibility (5)
                    {
                      $cond: [
                        {
                          $or: [
                            { $eq: ["$workType", null] },
                            { $eq: ["$workType", ""] },
                            { $eq: ["$workType", candidateWorkType] },
                          ],
                        },
                        5,
                        0,
                      ],
                    },
                  ],
                },
              },
            },
            { $match: matchConditions },
            { $count: "total" },
          ]);

          return result?.[0]?.total || 0;
        } catch (err) {
          console.error(
            "getCandidateSelfStatistics: job matching aggregate error",
            err
          );
          return 0;
        }
      })(),
    ]);

    const interviewStatusAgg = Array.isArray(interviewStatusAggRaw)
      ? interviewStatusAggRaw
      : [];

    let hired = 0;
    let rejected = 0;
    let completed = 0;
    let available = 0;

    interviewStatusAgg.forEach((row) => {
      if (row._id === "hired") hired = row.count;
      if (row._id === "rejected") rejected = row.count;
      if (row._id === "completed") completed = row.count;
      if (row._id === "available") available = row.count;
    });

    return res.json({
      candidateId,
      profileCompleteness,
      profileCompletenessLabel,
      profileCompletenessBreakdown,
      // Interview flow statistics
      totalInterviews: candidateInterviews,
      interviewsScheduled: candidateInterviews, // Total interviews represent scheduled ones
      interviewsAttended: completed, // Interviews marked as completed
      // Job application flow statistics
      jobsApplied: jobsAppliedCount,
      jobMatches: jobMatchesCount, // Potential matches based on profile
      pendingInterviewRequests: pendingInterviewRequestsCount,
      // Final outcomes
      hired,
      rejected,
      // Additional review statuses (currently unused in response but kept for potential future use)
      // reviewPending: available,
    });
  } catch (error) {
    console.error("getCandidateSelfStatistics: unexpected error", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

exports.createCandidatesCsvFile = async (req, res) => {
  try {
    const candidate_Data = await Candidates.updateOne(req.body);
    res.json({
      candidate_Data,
      msg: "success",
    });
  } catch (err) {
    console.info("candidate create err =>", err);
    res.json({ columns: err?.columns, constraint: err?.constraint });
  }
};

exports.createCandidates = async (req, res) => {
  const agencyId = req.headers["agencyid"] || req?.body?.agencyId;
  let { professional, industries_relation, ...data } = req.body;
  try {
    if (!data.mobile) {
      return res.status(400).json({ error: "Mobile number is required" });
    }
    const existingCandidateEmail = data.email ? await Candidates.findOne({
      email: data.email,
    }) : null;
    if (existingCandidateEmail) {
      return res.json({
        error: "Your email is already in used",
        duplicate: true,
        existingCandidate: existingCandidateEmail
      });
    }
    const existingCandidateMobile = data.mobile ? await Candidates.findOne({
      mobile: data.mobile,
    }) : null;
    if (existingCandidateMobile) {
      return res.json({
        error: "Your Mobile number is already in used",
        duplicate: true,
        existingCandidate: existingCandidateMobile
      });
    }
    if (req?.files?.image) {
      // let resp = await fileUpload(req.files.image)
      let resp = await awsUploadFiles(req.files.image);
      if (resp?.url) data.image = `${resp.url}`;
    }
    if (req?.files?.resume) {
      let resp = await awsUploadFiles(req.files.resume);
      // let resp = await fileUpload(req.files.resume)
      if (resp?.url) {
        data.resume = `${resp.url}`;
      } else {
        console.error("createCandidates: resume upload failed");
      }
    } else if (
      data.resume === "null" ||
      data.resume === "undefined" ||
      data.resume === "[object Object]"
    ) {
      delete data.resume;
    }
    if (professional) {
      try {
        professional =
          typeof professional === "string"
            ? JSON.parse(professional)
            : professional;
      } catch (e) {
        professional = {};
      }
    }
    if (!professional || typeof professional !== "object") {
      professional = {};
    }
    // Keep salaries on professional even if client sent them at root
    if (professional && typeof professional === "object") {
      if (
        (professional.expectedsalary === undefined ||
          professional.expectedsalary === null ||
          professional.expectedsalary === "") &&
        (data.expectedsalary || data.expectedSalary)
      ) {
        professional.expectedsalary = data.expectedsalary || data.expectedSalary;
      }
      if (
        (professional.currentSalary === undefined ||
          professional.currentSalary === null ||
          professional.currentSalary === "") &&
        data.currentSalary
      ) {
        professional.currentSalary = data.currentSalary;
      }
    }
    const industriesId = [];
    try {
      if (typeof industries_relation === "string") {
        industries_relation = JSON.parse(industries_relation);
      } else if (req.body.industries_relation) {
        industries_relation =
          typeof req.body.industries_relation === "string"
            ? JSON.parse(req.body.industries_relation)
            : req.body.industries_relation;
      } else {
        industries_relation = [];
      }
    } catch (e) {
      industries_relation = [];
    }
    if (!Array.isArray(industries_relation)) {
      industries_relation = [];
    }
    industries_relation?.filter((ele) => {
      industriesId.push(ele?.industriesId);
    });

    let jobCategoryId = professional?.jobCategoryId;

    const jobCategories = jobCategoryId
      ? await JobCategory.findOne({ id: jobCategoryId })
      : null;

    professional = {
      ...professional,
      jobCategory: jobCategories,
    };

    // Keep employer/company in sync so listing % matches create form
    if (
      professional.currentEmployer &&
      !professional.currentCompany
    ) {
      professional.currentCompany = professional.currentEmployer;
    } else if (
      professional.currentCompany &&
      !professional.currentEmployer
    ) {
      professional.currentEmployer = professional.currentCompany;
    }

    let objectid = new mongoose.Types.ObjectId();

    // Fetch job opening details if jobOpeningId is provided
    let jobOpening = null;
    if (data.jobOpeningId && data.jobOpeningId !== "null") {
      jobOpening = await JobOpening.findOne({ id: data.jobOpeningId });
    }

    const industries_relationlist = [];
    for (let index = 0; index < industriesId.length; index++) {
      const element = industriesId[index];
      let objectidforloop = new mongoose.Types.ObjectId();
      industries_relationlist.push({
        id: objectidforloop,
        _id: objectidforloop,
        createdAt: new Date(),
        cId: objectid,
        industriesId: element,
        industries: await Industries.findOne({ id: element }),
      });
    }

    const client = await Clients.aggregate([
      {
        $match: {
          agencyId: agencyId,
        },
      },
      {
        $match: {
          $or: [
            {
              "jobCategory_relation.jobCategoryId": jobCategoryId,
            },
            {
              "industries_relation.industriesId": { $in: industriesId },
            },
          ],
          ...(data?.city != null && data.city !== "" ? { $and: [{ city: new RegExp("^" + data.city.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$", "i") }] } : {}), // case-insensitive city match
        },
      },
    ]);

    const agencyEmail = await Agency.aggregate([
      {
        $match: { id: agencyId },
      },
      {
        $project: { email: 1, name: 1, companyowner: 1 },
      },
    ]);
    if (data.interviewerId === "null") delete data.interviewerId;
    if (data.jobOpeningId === "null") delete data.jobOpeningId;

    const candidate = await Candidates.create({
      id: objectid,
      _id: objectid,
      agencyId: agencyId,
      professional: professional,
      industries_relation: industries_relationlist,
      ...data,
    }).then(async (responce) => {
      // Ensure candidate has a corresponding user for login
      try {
        const candidateEmail = responce?.email;
        const candidateMobile = responce?.mobile;

        if (candidateEmail) {
          // Find or create "Candidate" role
          let candidateRole = await Role.findOne({ name: "Candidate" });
          if (!candidateRole) {
            throw new Error("Candidate role not found");
          }

          // Check if user already exists for this email (within same agency)
          let user = await Users.findOne({
            email: candidateEmail,
            agencyId: agencyId,
          });

          let plainPasswordForMail = null;

          if (!user) {
            const objectIdUserData = new mongoose.Types.ObjectId();

            // STRICT: Mobile number is the ONLY source for initial password
            plainPasswordForMail = candidateMobile;

            if (!plainPasswordForMail) {
              throw new Error("Mobile number missing during user creation");
            }

            const hashedPassword = await bcrypt.hash(plainPasswordForMail, 10);

            const userName =
              `${responce?.firstname || ""} ${responce?.lastname || ""
                }`.trim() || candidateEmail;

            user = await Users.create({
              id: objectIdUserData,
              _id: objectIdUserData,
              roleId: candidateRole?.id,
              name: userName,
              email: candidateEmail,
              password: hashedPassword,
              mobile: candidateMobile,
              agencyId: agencyId,
              isBcrypt: true,
            });
          }

          // Link candidate to user if not already linked
          if (!responce?.userId && user?.id) {
            await Candidates.updateOne(
              { id: responce.id },
              { $set: { userId: user.id } }
            );
          }

          // Send login credentials email
          if (plainPasswordForMail) {
            await enqueueEmailJob("candidateLoginCredentials", {
              candidate: {
                firstname: responce?.firstname,
                lastname: responce?.lastname,
                email: responce?.email,
              },
              emailTo: responce?.email,
              password: plainPasswordForMail,
            });
          }
        }
      } catch (candidateUserErr) {
        console.info(
          "createCandidates -> candidate user creation error =>",
          candidateUserErr
        );
      }

      // Always trigger Msg API using resume/form mobile — independent of email jobs.
      // Multi-resume upload creates candidates one-by-one, so each create = one API call.
      try {
        const candidateForMsg =
          typeof responce?.toObject === "function"
            ? responce.toObject()
            : responce;
        console.info(
          "Msg API trigger => candidateId:",
          candidateForMsg?.id,
          "mobile:",
          candidateForMsg?.mobile
        );
        sendWelcomeWhatsapp(candidateForMsg).catch((err) => {
          console.info("sendWelcomeWhatsapp error =>", err?.message || err);
        });
      } catch (msgErr) {
        console.info("sendWelcomeWhatsapp trigger error =>", msgErr?.message || msgErr);
      }

      try {
        await enqueueEmailJob("candidateRegistrationSuccess", {
          candidate: responce,
          emailTo: agencyEmail[0]?.email,
          companyName: agencyEmail[0]?.name,
          companyowner: agencyEmail[0]?.companyowner,
        });
      } catch (emailErr) {
        console.info(
          "candidateRegistrationSuccess email error =>",
          emailErr?.message || emailErr
        );
      }

      if (client?.length > 0) {
        try {
          await enqueueEmailJob("bulkCandidatesToClients", {
            clientsEmail: client,
            candidate: responce,
            agencyName: agencyEmail[0]?.name,
            jobTitle: jobOpening?.designation,
          });
        } catch (bulkEmailErr) {
          console.info(
            "bulkCandidatesToClients email error =>",
            bulkEmailErr?.message || bulkEmailErr
          );
        }
      }

      // Applied Candidates page: link new candidate to the job so it shows in applicants list
      if (jobOpening?.id && responce?.id) {
        try {
          const clientWhoPostedJob = await Clients.findOne({
            userId: jobOpening.userId,
          });
          const clientId =
            clientWhoPostedJob?.id || jobOpening.clientId || null;
          if (clientId) {
            const existingApplication = await JobApplication.findOne({
              jobOpeningId: String(jobOpening.id),
              candidateId: String(responce.id),
            });
            if (!existingApplication) {
              const appId = new mongoose.Types.ObjectId();
              await JobApplication.create({
                id: appId,
                _id: appId,
                jobOpeningId: String(jobOpening.id),
                candidateId: String(responce.id),
                clientId: String(clientId),
                status: "applied",
              });
            }
          } else {
            console.error(
              "createCandidates: JobApplication skipped — clientId not found for job",
              jobOpening.id
            );
          }
        } catch (jobAppErr) {
          console.error(
            "createCandidates: JobApplication create failed =>",
            jobAppErr?.message || jobAppErr
          );
        }
      }

      res.send(responce);
    });
  } catch (err) {
    console.log("dataa candidate create errr", err);
    res.json({ columns: err?.columns, constraint: err?.constraint });
  }
};

exports.deleteCandidate = async (req, res) => {
  const idofcandi = req.params.id;
  try {
    const deletionResult = await Candidates.deleteOne({
      id: idofcandi,
    });

    if (deletionResult.deletedCount === 0) {
      return res.status(404).json({ error: "Candidate not found" });
    }

    // Cascade delete related records
    await JobApplication.deleteMany({ candidateId: idofcandi });
    if (ResumeEnquiry) {
      await ResumeEnquiry.deleteMany({ candidateId: idofcandi });
    }
    await InterviewRequest.deleteMany({ candidateId: idofcandi });

    res.json({ msg: "success" });
  } catch (error) {
    console.log("delete candidate", error);
    res.json({ msg: "delete candidate err" });
  }
};

exports.candidateUpdate = async (req, res) => {
  let {
    id,
    industries_relation,
    jobOpeningId,
    professional,
    agencyId,
    ...candidate
  } = req.body;
  const existingCandidateEmail = await Candidates.findOne({
    email: candidate.email,
    id: { $ne: id },
  });
  if (existingCandidateEmail) {
    return res.json({
      error: "Your email is already in used",
    });
  }
  const existingCandidateMobile = await Candidates.findOne({
    mobile: candidate.mobile,
    id: { $ne: id },
  });
  if (existingCandidateMobile) {
    return res.json({
      error: "Your Mobile number is already in used",
    });
  }

  if (candidate?.interviewerId == "null") {
    delete candidate?.interviewerId;
  }
  if (candidate?.jobOpeningId == "null") {
    delete candidate?.jobOpeningId;
  }

  if (req?.files?.image) {
    let resp = await awsUploadFiles(req?.files?.image);
    if (resp?.success && resp?.url) {
      candidate.image = `${resp.url}`;
    }
  }
  if (req?.files?.resume) {
    let resp = await awsUploadFiles(req?.files?.resume);
    // let resp = await fileUpload(req.files.resume)
    if (resp?.success && resp?.url) {
      candidate.resume = `${resp.url}`;
    }
  }

  // Security: Prevent password leakage into Candidates collection
  if (candidate.password) delete candidate.password;

  try {
    if (typeof req.body.professional === "string" && req.body.professional) {
      professional = JSON.parse(req.body.professional);
    } else if (professional && typeof professional === "object") {
      // already an object
    } else {
      professional = null;
    }

    if (professional) {
    let jobCategoryId = professional.jobCategoryId;

    const jobCategories = await JobCategory.find({ id: jobCategoryId });

    professional = {
      ...professional,
      jobCategory: jobCategories[0],
    };
    if (
      professional.currentEmployer &&
      !professional.currentCompany
    ) {
      professional.currentCompany = professional.currentEmployer;
    } else if (
      professional.currentCompany &&
      !professional.currentEmployer
    ) {
      professional.currentEmployer = professional.currentCompany;
    }
    }
    if (industries_relation?.length > 0) {
      let industriesIdlist = JSON.parse(industries_relation)?.map(
        (item) => item?.industriesId
      );
      const industries_relationlist = [];
      for (let index = 0; index < industriesIdlist.length; index++) {
        const element = industriesIdlist[index];
        let objectid = new mongoose.Types.ObjectId();
        industries_relationlist.push({
          id: objectid,
          createdAt: new Date(),
          cId: id,
          industriesId: element,
          industries: await Industries.findOne({ id: element }),
        });
      }

      const updatePayload = {
        industries_relation: industries_relationlist,
        ...candidate,
      };
      if (professional) updatePayload.professional = professional;

      await Candidates.updateOne(
        { id: id },
        {
          $set: updatePayload,
        }
      );
    } else {
      const updatePayload = { ...candidate };
      if (professional) updatePayload.professional = professional;

      await Candidates.updateOne(
        { id: id },
        {
          $set: updatePayload,
        }
      );
    }

    // After edit/save — trigger Msg APIs (e.g. API Config 2 with {{unfilled_fields_*}})
    try {
      const updatedCandidate = await Candidates.findOne({ id });
      if (updatedCandidate) {
        const candidateForMsg =
          typeof updatedCandidate.toObject === "function"
            ? updatedCandidate.toObject()
            : updatedCandidate;
        console.info(
          "Msg API trigger (update) => candidateId:",
          candidateForMsg?.id,
          "mobile:",
          candidateForMsg?.mobile
        );
        sendWelcomeWhatsapp(candidateForMsg).catch((err) => {
          console.info(
            "sendWelcomeWhatsapp (update) error =>",
            err?.message || err
          );
        });
      }
    } catch (msgErr) {
      console.info(
        "sendWelcomeWhatsapp update trigger error =>",
        msgErr?.message || msgErr
      );
    }

    res.json({ msg: "success" });
  } catch (err) {
    console.log("candidate update", err);
    res.json({ columns: err?.columns, constraint: err?.constraint });
  }
};

// Filter Data
exports.getCandidates = async (req, res) => {
  let { page, perPage } = req.query;
  page -= 1;
  const basicDetails = req.body;
  const agencyId = req.headers["agencyid"];
  const userId2 = req.headers.userid;
  const date = new Date(moment().format("YYYY-MM-DD HH:mm:ss"));

  try {
    const profileCompletionFilter =
      basicDetails?.profileCompletion ||
      basicDetails?.profileCompletenessFilter ||
      null;
    delete basicDetails?.profileCompletion;
    delete basicDetails?.profileCompletenessFilter;

    const quickFilter = basicDetails?.quickFilter || null;
    delete basicDetails?.quickFilter;
    // Defensive: never treat meta keys as candidate field filters
    delete basicDetails?.quickFilter;

    // Drawer + quick-tab status filters must run AFTER interviewStatus lookup
    const drawerInterviewStatusRaw = basicDetails?.interviewStatus || null;
    const drawerInterviewStatus =
      typeof drawerInterviewStatusRaw === "string"
        ? drawerInterviewStatusRaw.trim()
        : drawerInterviewStatusRaw;
    delete basicDetails?.interviewStatus;

    // Status tabs are applied after interviewStatus lookup (not on stale document field)
    if (quickFilterNeedsStatusStages(quickFilter)) {
      delete basicDetails?.interviewStatus;
    }

    const commentsKeyword =
      typeof basicDetails?.comments === "string" && basicDetails.comments.trim()
        ? basicDetails.comments.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        : null;
    delete basicDetails?.comments;

    // Dashboard Statistics year/month redirect filters (candidate createdAt)
    let statsYear = basicDetails?.statsYear
      ? Number(basicDetails.statsYear)
      : 0;
    let statsMonth = basicDetails?.statsMonth
      ? Number(basicDetails.statsMonth)
      : 0;
    delete basicDetails?.statsYear;
    delete basicDetails?.statsMonth;

    let statsDateMatch = {};
    if (statsYear || statsMonth) {
      let from;
      let to;
      if (!statsYear) {
        statsYear = new Date().getFullYear();
      }
      if (!statsMonth) {
        from = new Date(`${statsYear}-01-01`);
        to = new Date(`${statsYear}-12-31T23:59:59.999`);
      } else {
        from = new Date(statsYear, statsMonth - 1, 1);
        to = new Date(statsYear, statsMonth, 0, 23, 59, 59, 999);
      }
      statsDateMatch = {
        createdAt: { $gte: from, $lte: to },
      };
    }

    const quickFilterEarlyMatch = getQuickFilterEarlyMatch(quickFilter);

    let industriesId = [];
    let jobCategoryId = [];
    if (basicDetails?.industries) {
      industriesId = basicDetails.industries;
    }
    let filterJobCategoryId = [];
    const candidateDetails = [
      "firstname",
      "lastname",
      "email",
      "mobile",
      "city",
      "cityId",
      "state",
      "stateId",
    ];
    const textField = [
      "noticePeriod",
      "course",
      "field",
      // "preferedJobLocation",
      "english",
      "currentlyWorking",
      "designation",
      "highestQualification",
      "expectedsalary",
      "experienceInyear",
      "currentSalary",
    ];
    let select = [];

    if (basicDetails?.filterJobCategoryId) {
      filterJobCategoryId = basicDetails?.filterJobCategoryId;
      delete basicDetails?.filterJobCategoryId;
    }
    if (basicDetails?.industriesId || basicDetails?.userId) {
      select = [
        "id",
        "firstname",
        "lastname",
        "gender",
        "street",
        "city",
        "interviewStatus",
        "status",
        "created_at",
        "resume",
      ];
    }
    if (
      basicDetails?.jobCategoryId?.length > 0 &&
      filterJobCategoryId.length === 0
    ) {
      jobCategoryId = basicDetails.jobCategoryId;
    }
    delete basicDetails?.industries;
    delete basicDetails?.jobCategoryId;

    let filter = {};
    let filterForProfessional = {};
    let preferedJobLocation = {};
    let dataMergePermissionobj = {};
    let filterforagency = {};
    let citiesfilter = {};
    if (basicDetails.dataMergePermission) {
      dataMergePermissionobj = basicDetails?.dataMergePermission;
    }
    delete basicDetails.dataMergePermission;
    let cities = [];
    const agencydiv = await Agency.findOne({
      id: agencyId,
    });
    agencydiv?.permission?.areas?.map((item) => {
      item?.cities.map((ele) => {
        if (ele.city) {
          cities.push(ele?.city);
        }
      });
    });

    const uniqueworld = await Agency.findOne({
      email: "uniqueworldjobs@gmail.com",
    });
    if (agencyId !== uniqueworld.id) {
      if (
        agencydiv?.permission?.dataMerge?.allAgency == true &&
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
    }
    let pipelineCandidate = [];
    if (uniqueworld.id !== agencyId) {
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
    for (const key in basicDetails) {
      if (key === "quickFilter" || key === "userId") {
        continue;
      }
      if (candidateDetails.includes(key)) {
        filter = {
          ...filter,
          [key]: { $regex: new RegExp(basicDetails[key], "i") },
        };
      } else if (textField.includes(key)) {
        const str = "professional." + key;
        // Free-text professional fields: partial, case-insensitive match
        if (key === "designation" || key === "course" || key === "field") {
          filterForProfessional = {
            ...filterForProfessional,
            [str]: { $regex: new RegExp(basicDetails[key], "i") },
          };
        } else {
          filterForProfessional = {
            ...filterForProfessional,
            [str]: basicDetails[key],
          };
        }
      } else if (key == "state") {
        filter = {
          ...filter,
          [key]: { $regex: new RegExp(basicDetails[key], "i") },
        };
      } else if (key == "gender") {
        filter = {
          ...filter,
          [key]: basicDetails[key],
        };
      } else if (key === "salaryRangeEnd" || key === "salaryRangeStart") {
        filter = {
          ...filter,
          "professional.expectedsalary": {
            $gte: Number(basicDetails["salaryRangeStart"]),
            $lte: Number(basicDetails["salaryRangeEnd"]),
          },
        };
      } else if (key == "preferedJobLocation") {
        preferedJobLocation = {
          ...preferedJobLocation,
          "professional.preferedJobLocation": {
            $regex: new RegExp(basicDetails[key], "i"),
          },
        };
      } else if (key === "userId" || key === "industriesId") {
        // meta keys — ignore
      } else {
        filter = {
          ...filter,
          [key]: basicDetails[key],
        };
      }
    }
    let jobCategoriesDiv = {};
    if (jobCategoryId.length > 0) {
      jobCategoriesDiv = {
        ...jobCategoriesDiv,
        "professional.jobCategoryId": { $in: jobCategoryId },
      };
    }

    let industriesIdDiv = {};
    if (industriesId.length > 0) {
      industriesIdDiv = {
        ...industriesIdDiv,
        "industries_relation.industriesId": { $in: industriesId },
      };
    }
    const pipeline = [
      {
        $match: {
          ...filterForProfessional,
          ...jobCategoriesDiv,
          ...preferedJobLocation,
          ...filter,
          ...industriesIdDiv,
          ...quickFilterEarlyMatch,
          ...statsDateMatch,
        },
      },
    ];

    const profileCompletionStages = [
      ...buildProfileCompletenessAddFieldsStages(),
    ];
    const profileCompletionMatchStage = getProfileCompletionMatchStage(
      profileCompletionFilter
    );
    if (profileCompletionMatchStage) {
      profileCompletionStages.push(profileCompletionMatchStage);
    }

    const viewAndStatusStages = [
      {
        $lookup: {
          from: "viewCandidates",
          localField: "id",
          foreignField: "candidateid",
          as: "viewCandidates",
          pipeline: [
            {
              $match: {
                userId: { $in: [userId2] },
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
      ...getQuickFilterPostViewStages(quickFilter, userId2, agencyId),
    ];

    // Resolve real interviewStatus before pagination for status tabs OR drawer filter
    const interviewStatusStages = getInterviewStatusStages(
      agencyId,
      quickFilter
    );
    if (drawerInterviewStatus) {
      const escapedDrawerStatus = String(drawerInterviewStatus).replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
      );
      interviewStatusStages.push({
        $match: {
          interviewStatus: {
            $regex: new RegExp(`^${escapedDrawerStatus}$`, "i"),
          },
        },
      });
    }
    const needsStatusFilter =
      quickFilterNeedsStatusStages(quickFilter) || !!drawerInterviewStatus;

    const commentsFilterStages = [];
    if (commentsKeyword) {
      const commentRegex = new RegExp(commentsKeyword, "i");
      commentsFilterStages.push(
        {
          $lookup: {
            from: "recruiterInternalComments",
            localField: "id",
            foreignField: "candidateId",
            as: "_filterInternalComments",
            pipeline: [
              {
                $match: {
                  agencyId: agencyId,
                  isdeleted: 0,
                  comment: { $regex: commentRegex },
                },
              },
              { $limit: 1 },
            ],
          },
        },
        {
          $match: {
            $or: [
              { comments: { $regex: commentRegex } },
              {
                $expr: { $gt: [{ $size: "$_filterInternalComments" }, 0] },
              },
            ],
          },
        },
        {
          $project: { _filterInternalComments: 0 },
        }
      );
    }

    const prePageStages = [
      ...pipelineCandidate,
      ...pipeline,
      ...profileCompletionStages,
      ...viewAndStatusStages,
      ...(needsStatusFilter ? interviewStatusStages : []),
      ...commentsFilterStages,
    ];

    const [candidate, countAgg] = await Promise.all([
      Candidates.aggregate([
      ...prePageStages,
      {
        $sort: {
          status: 1,
          createdAt: -1
        },
      },
      {
        $skip: page * perPage,
      },
      {
        $limit: Number(perPage),
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
          from: "interviews",
          localField: "id",
          foreignField: "candidateId",
          as: "interviews",
          pipeline: [
            {
              $match: { agencyId: agencyId },
            },
            {
              $lookup: {
                from: "users",
                localField: "userId",
                foreignField: "id",
                as: "users",
              },
            },
            {
              $addFields: {
                users: { $arrayElemAt: ["$users", 0] },
              },
            },
          ],
        },
      },
      {
        $addFields: {
          interviews: { $arrayElemAt: ["$interviews", 0] },
        },
      },
      // When status tab already resolved interviewStatus, skip duplicate lookup
      ...(needsStatusFilter
        ? []
        : getInterviewStatusStages(agencyId, null)),
      {
        $lookup: {
          from: "recruiterInternalComments",
          localField: "id",
          foreignField: "candidateId",
          as: "latestInternalComment",
          pipeline: [
            {
              $match: {
                agencyId: agencyId,
                isdeleted: 0,
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
              },
            },
          ],
        },
      },
      {
        $addFields: {
          latestInternalComment: {
            $arrayElemAt: ["$latestInternalComment", 0],
          },
        },
      },
      {
        $unset: "professional.jobCategory.updatedAt",
      },
      {
        $unset: "professional.updatedAt",
      },
      {
        $unset: "updatedAt",
      },
      {
        $lookup: {
          from: "savedCandidates",
          localField: "id",
          foreignField: "candidateId",
          as: "savedCandidates",
          pipeline: [
            {
              $match: {
                userId: String(userId2),
                ...(agencyId ? { agencyId: String(agencyId) } : {}),
              },
            },
          ],
        },
      },
      {
        $addFields: {
          savedCandidates: { $arrayElemAt: ["$savedCandidates", 0] },
        },
      },
      {
        $project: { viewCandidates: 0 },
      },
    ]),
      Candidates.aggregate([
        ...prePageStages,
        { $count: "total" },
      ]),
    ]);

    const filteredTotal = countAgg?.[0]?.total ?? 0;

    const result = {
      data: candidate,
      count: filteredTotal,
    };
    res.json({
      results: result.data,
      total: result.count,
    });
  } catch (error) {
    console.log("Candidate Filter", error);
    return res.status(500).json({
      results: [],
      total: 0,
      error: error?.message || "Candidate filter failed",
    });
  }
};

//candidate view update
exports.candidateView = async (req, res) => {
  const id = req.params.id;
  const agencyId = req.headers["agencyid"];
  const userId2 = req.headers.userid;
  const findViewd = await viewCandidates.findOne({
    // userId: { $in: [userId2] },
    agencyId: agencyId,
    candidateid: id,
  });
  const findAlreadyviewed = await viewCandidates.findOne({
    agencyId: agencyId,
    candidateid: id,
    userId: { $in: [userId2] },
  });
  if (findAlreadyviewed) {
    res.send({ msg: "success", msg2: "Already viewed" });
  } else if (findViewd) {
    await viewCandidates
      .updateOne({ id: findViewd.id }, { $push: { userId: userId2 } })
      .then(() => res.json({ msg: "success" }));
  } else {
    const objectid = new mongoose.Types.ObjectId();
    await viewCandidates
      .create({
        id: objectid,
        _id: objectid,
        candidateid: id,
        agencyId: agencyId,
        userId: userId2,
      })
      // await Candidates.updateOne({ id }, { status: "view" })
      .then(() => res.json({ msg: "success" }));
  }
};

exports.checkCandidate = async (req, res) => {
  const { mobile, email } = req.body;
  try {
    const mobileData = mobile ? await Candidates.findOne({ mobile: mobile }) : null;
    const emailData = email ? await Candidates.findOne({ email: email }) : null;
    
    if (emailData) {
      return res.json({
        msg: "Already registered",
        duplicate: true,
        existingCandidate: emailData,
        error: "Your email is already in used"
      });
    }
    if (mobileData) {
      return res.json({
        msg: "Already registered",
        duplicate: true,
        existingCandidate: mobileData,
        error: "Your Mobile number is already in used"
      });
    }
    return res.json({ msg: false, duplicate: false });
  } catch (err) {
    console.info("----------------------------");
    console.info(" check Candidate err =>", err);
    console.info("----------------------------");
    return res.status(500).json({ error: "Internal server error" });
  }
};

/** Public: load candidate for registration/edit form (?cid=) — scoped by agency slug */
exports.getPublicCandidateForApply = async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    const slug = String(req.query.slug || "").trim();
    if (!id) {
      return res.status(400).json({ error: "Candidate id required" });
    }
    const doc = await Candidates.findOne({ id }).lean();
    if (!doc) {
      return res.status(404).json({ error: "Candidate not found" });
    }
    if (slug) {
      const agencyDoc = await Agency.findOne({ slug }).select("id slug").lean();
      if (!agencyDoc || String(agencyDoc.id) !== String(doc.agencyId)) {
        return res.status(404).json({ error: "Candidate not found" });
      }
    }
    return res.json({ msg: "success", data: doc });
  } catch (err) {
    console.info("getPublicCandidateForApply error =>", err?.message || err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

exports.hiredCandidateforClients = async (req, res) => {
  // const onBoardingId = req?.query?.id;
  const clientId = req?.query?.id;
  const agencyId = req.headers["agencyid"];
  let { page, perPage } = req.query;
  page -= 1;

  const candidate = await interviewStatus.aggregate([
    {
      $match: { agencyId: agencyId },
    },
    {
      $match: { ClientId: clientId },
    },
    {
      $match: { interviewStatus: "hired" },
    },
    {
      $lookup: {
        from: "candidates",
        localField: "candidateid",
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
    data: candidate[0].data,
    count: candidate[0].count[0] ? candidate[0].count[0].count : 0,
  };
  try {
    res.json({
      results: result.data,
      total: result.count,
    });
  } catch (error) {
    console.log("Candidate hired Filter", error);
  }
};
exports.candidatesForClients = async (req, res) => {
  let { page, perPage } = req.query;
  page -= 1;
  const basicDetails = req.body;
  let industriesId = [];
  let select = [];
  if (basicDetails?.industriesId || basicDetails?.userId) {
    select = [
      "firstname",
      "lastname",
      "gender",
      "city",
      "interviewStatus",
      "status",
    ];
    if (basicDetails?.industriesId) {
      industriesId = JSON.parse(basicDetails.industriesId);
    }
  }
  delete basicDetails?.industriesId;
  try {
    const candidate = await Candidates.aggregate([
      {
        $sort: { createdAt: -1 },
      },
      {
        $match: {
          $and: [
            { "candidates.userId": basicDetails?.userId },
            {
              "candidates.interviewStatus": "hired",
            },
          ],
        },
      },
      {
        $skip: page * perPage,
      },
      {
        $limit: Number(perPage),
      },
    ]);
    res.json(candidate);
  } catch (err) {
    console.info("-------------------------------");
    console.info(" industriesWisedCandidates=> ", err);
    console.info("-------------------------------");
  }
};
exports.sendBulkMailToCandidates = async (req, res) => {
  const data = req.body;
  try {
    await enqueueEmailJob("bulkMail", { obj: data });
    res.status(202).json({ msg: "Emails queued" });
  } catch (err) {
    console.info("----------------------------");
    console.info("sendBulkMailToCandidates =>", err);
    console.info("----------------------------");
    res.status(500).json(err);
  }
};

exports.getClientCandidates = async (req, res) => {
  let { page, perPage, isSavedCandidates } = req.query;
  page -= 1;
  const basicDetails = req.body;
  const agencyId = req.headers["agencyid"];
  const userId = req.headers.userid;

  try {
    const profileCompletionFilter =
      basicDetails?.profileCompletion ||
      basicDetails?.profileCompletenessFilter ||
      null;
    delete basicDetails?.profileCompletion;
    delete basicDetails?.profileCompletenessFilter;

    const quickFilter = basicDetails?.quickFilter || null;
    delete basicDetails?.quickFilter;
    if (quickFilterNeedsStatusStages(quickFilter)) {
      delete basicDetails?.interviewStatus;
    }
    if (quickFilter === "favorites") {
      isSavedCandidates = true;
    }
    const quickFilterEarlyMatch = {
      ...getQuickFilterEarlyMatch(quickFilter),
      ...(getQuickFilterStatusMatch(quickFilter) || {}),
    };

    let industriesId = [];
    let jobCategoryId = [];
    if (basicDetails?.industriesId?.length > 0) {
      industriesId = basicDetails.industriesId;
    }

    const candidateDetails = [
      "firstname",
      "lastname",
      "email",
      "mobile",
      "city",
      "cityId",
    ];
    const textField = [
      "noticePeriod",
      "course",
      "field",
      // "preferedJobLocation",
      "english",
      "currentlyWorking",
      "designation",
      "highestQualification",
      // "expectedsalary",
      "experienceInyear",
      // "currentSalary",
    ];
    let select = [];
    let filterJobCategoryId = [];
    let filterIndustriesId = [];

    if (basicDetails?.filterJobCategoryId) {
      filterJobCategoryId = basicDetails.filterJobCategoryId;
      delete basicDetails?.filterJobCategoryId;
    }
    if (basicDetails?.industries) {
      filterIndustriesId = basicDetails.industries;
      delete basicDetails?.industries;
    }
    if (basicDetails?.industriesId || basicDetails?.userId) {
      select = [
        "id",
        "firstname",
        "lastname",
        "gender",
        "street",
        "city",
        "interviewStatus",
        "status",
        "created_at",
        "resume",
      ];
    }
    if (basicDetails?.jobCategoryId?.length > 0) {
      jobCategoryId = basicDetails.jobCategoryId;
    }
    delete basicDetails?.industriesId;
    delete basicDetails?.jobCategoryId;
    let filter = {};
    let filterForProfessional = {};
    let preferedJobLocation = {};
    for (const key in basicDetails) {
      if (candidateDetails.includes(key)) {
        filter = {
          ...filter,
          [key]: { $regex: new RegExp(basicDetails[key], "i") },
        };
      } else if (textField.includes(key)) {
        const str = "professional." + key;
        if (key === "designation" || key === "course" || key === "field") {
          filterForProfessional = {
            ...filterForProfessional,
            [str]: { $regex: new RegExp(basicDetails[key], "i") },
          };
        } else {
          filterForProfessional = {
            ...filterForProfessional,
            [str]: basicDetails[key],
          };
        }
      } else if (key == "state") {
        filter = {
          ...filter,
          [key]: { $regex: new RegExp(basicDetails[key], "i") },
        };
      } else if (key == "gender") {
        filter = {
          ...filter,
          [key]: basicDetails[key],
        };
      } else if (key == "preferedJobLocation") {
        preferedJobLocation = {
          ...preferedJobLocation,
          "professional.preferedJobLocation": {
            $regex: new RegExp(basicDetails[key], "i"),
          },
        };
      } else if (key == "interviewStatus") {
        filter = {
          ...filter,
          [key]: basicDetails[key],
        };
      } else if (key === "salaryRangeEnd" || key === "salaryRangeStart") {
        filter = {
          ...filter,
          "professional.expectedsalary": {
            $gte: Number(basicDetails["salaryRangeStart"]),
            $lte: Number(basicDetails["salaryRangeEnd"]),
          },
        };
      }
      // else if (key == "salaryRangeEnd" || key == "salaryRangeStart") {
      //   filter = {
      //     ...filter,
      //     "professional.currentSalary": {
      //       $gte: Number(basicDetails["salaryRangeStart"]),
      //       $lte: Number(basicDetails["salaryRangeEnd"]),
      //     },
      //   };
      // }
    }

    let jobCategoriesFilters = {};

    // if (jobCategoryId.length > 0) {
    //   jobCategoriesFilters = {
    //     ...jobCategoriesFilters,
    //     "professional.jobCategoryId": { $in: jobCategoryId },
    //   };
    // }
    let FilterforJobcategory = {};
    if (filterJobCategoryId.length > 0) {
      FilterforJobcategory = {
        ...FilterforJobcategory,
        "professional.jobCategoryId": { $in: filterJobCategoryId },
      };
    }

    let industriesFilter = {};
    // if (industriesId.length > 0) {
    //   industriesFilter = {
    //     ...industriesFilter,
    //     "industries_relation.industriesId": { $in: industriesId },
    //   };
    // }
    let industriesidFilter = {};
    if (filterIndustriesId.length > 0) {
      industriesidFilter = {
        ...industriesidFilter,
        "industries_relation.industriesId": { $in: filterIndustriesId },
      };
    }
    let filters = {};
    // if (jobCategoryId.length > 0 && industriesId.length > 0) {
    //   filters = { $or: [{ ...jobCategoriesFilters }, { ...industriesFilter }] };
    // } else if (jobCategoryId.length > 0 && industriesId.length == 0) {
    //   filters = { ...jobCategoriesFilters };
    // } else if (jobCategoryId.length == 0 && industriesId.length > 0) {
    //   filters = { ...industriesFilter };
    // }
    let savedCandidatesobj = {};
    let savedCandidatesobj2 = {};

    if (isSavedCandidates == "true" || isSavedCandidates == true) {
      savedCandidatesobj = {
        ...savedCandidatesobj,
        savedCandidates: { $exists: true },
      };
      savedCandidatesobj2 = {
        ...savedCandidatesobj2,
        "savedCandidates.userId": basicDetails?.userId,
      };
      filters = {};
    }
    const user = await Users.findOne({
      id: basicDetails?.userId,
    }).populate("role");
    let ClientsVar = await Clients.aggregate([
      { $match: { email: user?.email } },
      { $match: { agencyId: user?.agencyId } },
    ]);
    const agencydiv = await Agency.findOne({
      id: agencyId,
    });
    const uniqueworld = await Agency.findOne({
      email: "uniqueworldjobs@gmail.com",
    });
    let filterforagency = {};
    if (agencyId !== uniqueworld.id) {
      if (
        agencydiv?.permission?.dataMerge?.allAgency == true &&
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
    }
    let cities = [];
    agencydiv?.permission?.areas?.map((item) => {
      item?.cities.map((ele) => {
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
            },
          },
          {
            $match: { ...filterforagency },
          }
        );
      }
    }
    const cityRegex = new RegExp(`${user?.city}`, "i");
    const pipelined = [
      {
        $match: savedCandidatesobj2,
      },
      {
        $match: FilterforJobcategory,
      },
      {
        $match: industriesidFilter,
      },
      {
        $match: { city: cityRegex },
      },
      {
        $match: {
          // $or: [{ ...industriesFilter }],
          // $or: [{ ...jobCategoriesFilters }, { ...industriesFilter }],
          ...filterForProfessional,
          ...preferedJobLocation,
          ...filter,
          ...filters,
          ...quickFilterEarlyMatch,
        },
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
      ...pipelineCandidate,
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
              $match: { clientId: ClientsVar[0]?.id },
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
    ];

    const profileCompletionStages = [
      ...buildProfileCompletenessAddFieldsStages(),
    ];
    const profileCompletionMatchStage = getProfileCompletionMatchStage(
      profileCompletionFilter
    );
    if (profileCompletionMatchStage) {
      profileCompletionStages.push(profileCompletionMatchStage);
    }

    const demo = await Candidates.aggregate([
      {
        $sort: { createdAt: -1 },
      },
      {
        $lookup: {
          from: "savedCandidates",
          localField: "id",
          foreignField: "candidateId",
          as: "savedCandidates",
        },
      },
      {
        $addFields: {
          savedCandidates: { $arrayElemAt: ["$savedCandidates", 0] },
        },
      },
      ...pipelined,
      ...profileCompletionStages,
      ...getClientVisibleCommentsStages(agencyId),
      ...getLatestInternalCommentStages(agencyId, { clientVisibleOnly: true }),
      {
        $skip: page * perPage,
      },
      {
        $limit: Number(perPage),
      },
    ]);

    const count = await Candidates.aggregate([
      {
        $sort: { createdAt: -1 },
      },
      {
        $lookup: {
          from: "savedCandidates",
          localField: "id",
          foreignField: "candidateId",
          as: "savedCandidates",
        },
      },
      {
        $addFields: {
          savedCandidates: { $arrayElemAt: ["$savedCandidates", 0] },
        },
      },
      ...pipelined,
      ...profileCompletionStages,
      {
        $count: "count",
      },
    ]);

    res.json({
      results: demo,
      total: count[0]?.count,
    });
  } catch (error) {
    console.log("Candidate Filter", error);
  }
};
exports.BestMatchClientCandidates = async (req, res) => {
  let { page, perPage, isSavedCandidates } = req.query;
  page -= 1;
  const basicDetails = req.body;
  const agencyId = req.headers["agencyid"];
  const userId = req.headers.userid;

  try {
    const profileCompletionFilter =
      basicDetails?.profileCompletion ||
      basicDetails?.profileCompletenessFilter ||
      null;
    delete basicDetails?.profileCompletion;
    delete basicDetails?.profileCompletenessFilter;

    let industriesId = [];
    let jobCategoryId = [];
    if (basicDetails?.industriesId?.length > 0) {
      industriesId = basicDetails.industriesId;
    }

    const candidateDetails = [
      "firstname",
      "lastname",
      "email",
      "mobile",
      "city",
      "cityId",
    ];
    const textField = [
      "noticePeriod",
      "course",
      "field",
      // "preferedJobLocation",
      "english",
      "currentlyWorking",
      "designation",
      "highestQualification",
      // "expectedsalary",
      "experienceInyear",
      // "currentSalary",
    ];
    let select = [];
    let filterJobCategoryId = [];
    let filterIndustriesId = [];

    if (basicDetails?.filterJobCategoryId) {
      filterJobCategoryId = basicDetails.filterJobCategoryId;
      delete basicDetails?.filterJobCategoryId;
    }
    if (basicDetails?.industries) {
      filterIndustriesId = basicDetails.industries;
      delete basicDetails?.industries;
    }
    if (basicDetails?.industriesId || basicDetails?.userId) {
      select = [
        "id",
        "firstname",
        "lastname",
        "gender",
        "street",
        "city",
        "interviewStatus",
        "status",
        "created_at",
        "resume",
      ];
    }
    if (basicDetails?.jobCategoryId?.length > 0) {
      jobCategoryId = basicDetails.jobCategoryId;
    }
    delete basicDetails?.industriesId;
    delete basicDetails?.jobCategoryId;
    let filter = {};
    let filterForProfessional = {};
    let preferedJobLocation = {};
    for (const key in basicDetails) {
      if (candidateDetails.includes(key)) {
        filter = {
          ...filter,
          [key]: { $regex: new RegExp(basicDetails[key], "i") },
        };
      } else if (textField.includes(key)) {
        const str = "professional." + key;
        if (key === "designation" || key === "course" || key === "field") {
          filterForProfessional = {
            ...filterForProfessional,
            [str]: { $regex: new RegExp(basicDetails[key], "i") },
          };
        } else {
          filterForProfessional = {
            ...filterForProfessional,
            [str]: basicDetails[key],
          };
        }
      } else if (key == "state") {
        filter = {
          ...filter,
          [key]: { $regex: new RegExp(basicDetails[key], "i") },
        };
      } else if (key == "gender") {
        filter = {
          ...filter,
          [key]: basicDetails[key],
        };
      } else if (key == "preferedJobLocation") {
        preferedJobLocation = {
          ...preferedJobLocation,
          "professional.preferedJobLocation": {
            $regex: new RegExp(basicDetails[key], "i"),
          },
        };
      } else if (key == "interviewStatus") {
        filter = {
          ...filter,
          [key]: basicDetails[key],
        };
      } else if (key === "salaryRangeEnd" || key === "salaryRangeStart") {
        filter = {
          ...filter,
          "professional.expectedsalary": {
            $gte: Number(basicDetails["salaryRangeStart"]),
            $lte: Number(basicDetails["salaryRangeEnd"]),
          },
        };
      }
    }
    let jobCategoriesFilters = {};

    if (jobCategoryId.length > 0) {
      jobCategoriesFilters = {
        ...jobCategoriesFilters,
        "professional.jobCategoryId": { $in: jobCategoryId },
      };
    }
    let FilterforJobcategory = {};
    if (filterJobCategoryId.length > 0) {
      FilterforJobcategory = {
        ...FilterforJobcategory,
        "professional.jobCategoryId": { $in: filterJobCategoryId },
      };
    }

    let industriesFilter = {};
    if (industriesId.length > 0) {
      industriesFilter = {
        ...industriesFilter,
        "industries_relation.industriesId": { $in: industriesId },
      };
    }
    let industriesidFilter = {};
    if (filterIndustriesId.length > 0) {
      industriesidFilter = {
        ...industriesidFilter,
        "industries_relation.industriesId": { $in: filterIndustriesId },
      };
    }
    let filters = {};
    if (jobCategoryId.length > 0 && industriesId.length > 0) {
      filters = {
        $and: [{ ...jobCategoriesFilters }, { ...industriesFilter }],
      };
    } else if (jobCategoryId.length > 0 && industriesId.length == 0) {
      filters = { ...jobCategoriesFilters };
    } else if (jobCategoryId.length == 0 && industriesId.length > 0) {
      filters = { ...industriesFilter };
    }
    let savedCandidatesobj = {};
    let savedCandidatesobj2 = {};

    if (isSavedCandidates == "true" || isSavedCandidates == true) {
      savedCandidatesobj = {
        ...savedCandidatesobj,
        savedCandidates: { $exists: true },
      };
      savedCandidatesobj2 = {
        ...savedCandidatesobj2,
        "savedCandidates.userId": basicDetails?.userId,
      };
      filters = {};
    }
    const user = await Users.findOne({
      id: basicDetails?.userId,
    }).populate("role");
    let ClientsVar = await Clients.aggregate([
      { $match: { email: user?.email } },
      { $match: { agencyId: user?.agencyId } },
    ]);
    const agencydiv = await Agency.findOne({
      id: agencyId,
    });
    const uniqueworld = await Agency.findOne({
      email: "uniqueworldjobs@gmail.com",
    });
    let filterforagency = {};
    if (agencyId !== uniqueworld.id) {
      if (
        agencydiv?.permission?.dataMerge?.allAgency == true &&
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
    }
    let cities = [];
    agencydiv?.permission?.areas?.map((item) => {
      item?.cities.map((ele) => {
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
            },
          },
          {
            $match: { ...filterforagency },
          }
        );
      }
    }
    const cityRegex = new RegExp(`${user?.city}`, "i");
    const pipelined = [
      {
        $match: savedCandidatesobj2,
      },
      {
        $match: FilterforJobcategory,
      },
      {
        $match: industriesidFilter,
      },
      {
        $match: { city: cityRegex },
      },
      {
        $match: {
          // $or: [{ ...industriesFilter }],
          // $or: [{ ...jobCategoriesFilters }, { ...industriesFilter }],
          ...filterForProfessional,
          ...preferedJobLocation,
          ...filter,
          ...filters,
        },
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
      ...pipelineCandidate,
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
              $match: { clientId: ClientsVar[0]?.id },
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
    ];

    const profileCompletionStages = [
      ...buildProfileCompletenessAddFieldsStages(),
    ];
    const profileCompletionMatchStage = getProfileCompletionMatchStage(
      profileCompletionFilter
    );
    if (profileCompletionMatchStage) {
      profileCompletionStages.push(profileCompletionMatchStage);
    }

    const demo = await Candidates.aggregate([
      {
        $sort: { createdAt: -1 },
      },
      {
        $lookup: {
          from: "savedCandidates",
          localField: "id",
          foreignField: "candidateId",
          as: "savedCandidates",
        },
      },
      {
        $addFields: {
          savedCandidates: { $arrayElemAt: ["$savedCandidates", 0] },
        },
      },
      ...pipelined,
      ...profileCompletionStages,
      ...getClientVisibleCommentsStages(agencyId),
      ...getLatestInternalCommentStages(agencyId, { clientVisibleOnly: true }),
      {
        $skip: page * perPage,
      },
      {
        $limit: Number(perPage),
      },
    ]);

    const count = await Candidates.aggregate([
      {
        $sort: { createdAt: -1 },
      },
      {
        $lookup: {
          from: "savedCandidates",
          localField: "id",
          foreignField: "candidateId",
          as: "savedCandidates",
        },
      },
      {
        $addFields: {
          savedCandidates: { $arrayElemAt: ["$savedCandidates", 0] },
        },
      },
      ...pipelined,
      ...profileCompletionStages,
      {
        $count: "count",
      },
    ]);

    res.json({
      results: demo,
      total: count[0]?.count,
    });
  } catch (error) {
    console.log("Candidate Filter", error);
  }
};

exports.changeCandidatesDataSructure = async (req, res) => {
  // Candidate
  // try {
  //   const data = await Candidates.aggregate([
  //     {
  //       $sort: { createdAt: -1 },
  //     },
  //     {
  //       $lookup: {
  //         from: "industriesRelation",
  //         localField: "id",
  //         foreignField: "cId",
  //         as: "industries_relation",
  //         pipeline: [
  //           {
  //             $lookup: {
  //               from: "industries",
  //               localField: "industriesId",
  //               foreignField: "id",
  //               as: "industries",
  //             },
  //           },
  //           {
  //             $addFields: {
  //               industries: { $arrayElemAt: ["$industries", 0] },
  //             },
  //           },
  //         ],
  //       },
  //     },
  //     {
  //       $addFields: {
  //         industries_relation: { $arrayElemAt: ["$industries_relation", 0] },
  //       },
  //     },
  //     {
  //       $lookup: {
  //         from: "professional",
  //         localField: "id",
  //         foreignField: "candidateId",
  //         as: "professional",
  //         pipeline: [
  //           {
  //             $lookup: {
  //               from: "jobCategory",
  //               localField: "jobCategoryId",
  //               foreignField: "id",
  //               as: "jobCategory",
  //             },
  //           },
  //           {
  //             $addFields: {
  //               jobCategory: { $arrayElemAt: ["$jobCategory", 0] },
  //             },
  //           },
  //         ],
  //       },
  //     },
  //     {
  //       $addFields: {
  //         professional: { $arrayElemAt: ["$professional", 0] },
  //       },
  //     },
  //     // {
  //     //   $limit: 50,
  //     // },
  //   ]);
  //   res.json({ results: data });
  //   let i = 0;
  //   while (i < data?.length) {
  //     // const item = data[i];
  //     // console.info("-------------------------------");
  //     // console.info("item => ", item);
  //     // console.info("-------------------------------");
  //     // const objectId = new mongoose.Types.ObjectId();
  //     // await Candidates.updateOne(
  //     //   { id: item.id },
  //     //   { $set: { id: objectId, ...item } }
  //     // ).then(() => i++);
  //   }
  // } catch (error) {
  //   res.json(error);
  // }
  //Client
  // const data = await Clients.aggregate([
  //   {
  //     $sort: { createdAt: -1 },
  //   },
  //   {
  //     $lookup: {
  //       from: "industriesRelation",
  //       localField: "id",
  //       foreignField: "cId",
  //       as: "industries_relation",
  //       pipeline: [
  //         {
  //           $lookup: {
  //             from: "industries",
  //             localField: "industriesId",
  //             foreignField: "id",
  //             as: "industries",
  //           },
  //         },
  //         {
  //           $addFields: {
  //             industries: { $arrayElemAt: ["$industries", 0] },
  //           },
  //         },
  //       ],
  //     },
  //   },
  //   {
  //     $addFields: {
  //       industries_relation: { $arrayElemAt: ["$industries_relation", 0] },
  //     },
  //   },
  //   {
  //     $lookup: {
  //       from: "jobCategoryRelation",
  //       localField: "id",
  //       foreignField: "cId",
  //       as: "jobCategory_relation",
  //       pipeline: [
  //         {
  //           $lookup: {
  //             from: "jobCategory",
  //             localField: "jobCategoryId",
  //             foreignField: "id",
  //             as: "jobCategory",
  //           },
  //         },
  //         {
  //           $addFields: {
  //             jobCategory: { $arrayElemAt: ["$jobCategory", 0] },
  //           },
  //         },
  //       ],
  //     },
  //   },
  //   {
  //     $addFields: {
  //       jobCategory_relation: { $arrayElemAt: ["$jobCategory_relation", 0] },
  //     },
  //   },
  //   // {
  //   //   $limit: 50,
  //   // },
  // ]);
  // res.json({ results: data });
  // let i = 0;
  // while (i < data?.length) {
  //   const item = data[i];
  //   console.info("-------------------------------");
  //   console.info("item => ", item);
  //   console.info("-------------------------------");
  //   const objectId = new mongoose.Types.ObjectId();
  //   await Clients.updateOne(
  //     { id: item.id },
  //     { $set: { id: objectId, ...item } }
  //   ).then(() => i++);
  // }
  // Interview Status
  // const data = await Candidates.aggregate([
  //   {
  //     $sort: { createdAt: -1 },
  //   },
  //   {
  //     $lookup: {
  //       from: "interviews",
  //       localField: "id",
  //       foreignField: "candidateId",
  //       as: "interviews",
  //     },
  //   },
  //   {
  //     $unwind: "$interviews",
  //   },
  // {
  //   $addFields: {
  //     interviews: { $arrayElemAt: ["$interviews", 0] },
  //   },
  // },
  // {
  //   $limit: 50,
  // },
  // ]);
  // res.json({ results: data });
  // let i = 0;
  // while (i < data?.length) {
  //   const item = data[i];
  //   console.info("-------------------------------");
  //   console.info("item => ", item);
  //   console.info("-------------------------------");
  //   const objectId = new mongoose.Types.ObjectId();
  //   await interviewStatus
  //     .create({
  //       _id: objectId,
  //       id: objectId,
  //       interviewId: item?.interviews?.id,
  //       candidateid: item?.id,
  //       interviewStatus: item?.interviewStatus,
  //       userId: item?.interviews?.userId,
  //       interviewStatusUpdate: item?.interviewStatusUpdate,
  //       agencyId: "69717d7b-cf0b-49c2-a569-7f7d46adc7ae",
  //     })
  //     .then(() => i++);
  // }
  // client which are in users to have city and state
  // const data = await Clients.aggregate([
  //   {
  //     $sort: { createdAt: -1 },
  //   },
  //   {
  //     $lookup: {
  //       from: "users",
  //       localField: "userId",
  //       foreignField: "id",
  //       as: "users",
  //       pipeline: [
  //         {
  //           $match: {
  //             planId: {
  //               $in: [
  //                 "94791e55-83f7-43f7-95bb-0f6d13ed254d",
  //                 "1182bf42-be12-4327-892a-b4ef4f7af458",
  //               ],
  //             },
  //           },
  //         },
  //       ],
  //     },
  //   },
  //   {
  //     $addFields: {
  //       users: { $arrayElemAt: ["$users", 0] },
  //     },
  //   },
  //   {
  //     $count: "count",
  //   },
  //   // {
  //   //   $limit: 50,
  //   // },
  // ]);
  // res.json({ results: data });
  // let i = 0;
  // while (i < data?.length) {
  //   // const item = data[i];
  //   // console.info("-------------------------------");
  //   // console.info("item => ", item);
  //   // console.info("-------------------------------");
  //   // await Users.updateOne(
  //   //   { id: item.users.id },
  //   //   {
  //   //     $set: { state: item.state, city: item.city },
  //   //   }
  //   // ).then(() => i++);
  // }
  // const data = await Users.aggregate([
  //   {
  //     $lookup: {
  //       from: "subscriptions",
  //       localField: "subscriptionId",
  //       foreignField: "id",
  //       as: "subscriptions",
  //       pipeline: [
  //         {
  //           $match: {
  //             createdAt: {
  //               $gt: new Date("2023-04-30T10:21:55.123+00:00"),
  //             },
  //           },
  //         },
  //         {
  //           $match: {
  //             active_plan: true,
  //           },
  //         },
  //         {
  //           $lookup: {
  //             from: "plans",
  //             localField: "planId",
  //             foreignField: "id",
  //             as: "plans",
  //           },
  //         },
  //         {
  //           $unwind: "$plans",
  //         },
  //         // {
  //         // $match: { "plans.planName": "Enterprises" },
  //         // },
  //         {
  //           $match: {
  //             $or: [
  //               { "plans.planName": "Professionals" },
  //               { "plans.planName": "Enterprises" },
  //             ],
  //           },
  //         },
  //       ],
  //     },
  //   },
  //   {
  //     $unwind: "$subscriptions",
  //   },
  //   // {
  //   //   $addFields: {
  //   //     subscriptions: { $arrayElemAt: ["$subscriptions", 0] },
  //   //   },
  //   // },
  //   // {
  //   //   $count: "count",
  //   // },
  // ]);
  // res.json({ results: data });
  // let i = 0;
  // while (i < data?.length) {
  //   const item = data[i];
  //   console.info("-------------------------------");
  //   console.info("item => ", item);
  //   console.info("-------------------------------");
  //   await Orderofpayments.updateOne(
  //     { id: item?.id },
  //     {
  //       $set: {
  //         // id: objectId,
  //         // tax: "18",
  //         // TotalAmount: 7079,
  //         // zipcode: "null",
  //         // address: item?.address,
  //         // Company: "null",
  //         // lastname: item?.name.split(" ")[0],
  //         // firstname: item?.name.split(" ")[1],
  //         // city: item?.city,
  //         // email: item?.email,
  //         // state: item?.state,
  //         // paymentId: "null",
  //         // redirectUrl: "null",
  //         // gst: "null",
  //         // callbackUrl: "null",
  //         // merchantTransactionId: objectId,
  //         // name: item?.name,
  //         // planId: item?.subscriptions?.planId,
  //         // paymentMethod: "cash",
  //         // pannumber: "",
  //         // price: item?.subscriptions?.plans?.price,
  //         // agencyId: item?.agencyId,
  //         // merchantUserId: item?.userId,
  //         // paymentInstrument: "null",
  //         // redirectMode: "null",
  //         // mobileNumber: item?.mobile,
  //         // response: {
  //         //   success: true,
  //         //   code: "PAYMENT_SUCCESS",
  //         //   message: "Your payment is successful.",
  //         //   data: {
  //         //     merchantId: "PGTESTPAYUAT",
  //         //     merchantTransactionId: objectId,
  //         //     transactionId: "null",
  //         //     amount: 707900,
  //         //     state: "COMPLETED",
  //         //     responseCode: "SUCCESS",
  //         //     paymentInstrument: {
  //         //       type: "cash",
  //         //       cardType: "CREDIT_CARD",
  //         //       pgTransactionId: "PG2207221432267522530776",
  //         //       bankTransactionId: null,
  //         //       pgAuthorizationCode: null,
  //         //       arn: null,
  //         //       bankId: null,
  //         //       brn: "B12345",
  //         //     },
  //         //   },
  //         // },
  //         invoicenumber: i + 1,
  //       },
  //     }
  //   ).then(() => i++);
  // }
};
/**
 *  🎯 MATCHING CRITERIA & SCORING (100-point scale):
 * - Industry Match: 30 points (exact industry match)
 * - Job Category Match: 30 points (exact job category match)  
 * - Salary Compatibility: 20 points (within range or negotiable)
 * - Experience Requirements: 10 points (meets minimum experience)
 * - Location Preference: 5 points (fuzzy location matching)
 * - Work Type Compatibility: 5 points (matches work type if specified)
 * 
 * 📊 FILTERING FEATURES:
 * - Only active jobs (posted within last 30 days)
 * - Salary range matching with negotiable option
 * - Experience requirement validation
 * - Geographic location compatibility
 * - Work type alignment
 * 
 * 🔄 SORTING PRIORITY:
 * 1. Match Score (highest compatibility first)
 * 2. Job Recency (newest postings first)
 * 3. Creation Date (most recent first)
 * 
 * Get matching jobs for candidate based on their industry and job category
 * @param {Object} req - Request object with userId
 * @param {Object} res - Response object
 */
exports.candidateJobMatching = async (req, res) => {
  try {
    let { userId, page, perPage } = req.body;
    page = parseInt(page) || 1;
    perPage = parseInt(perPage) || 20;
    if (!userId) {
      return res.status(400).json({ msg: "userId is required" });
    }
    if (!page || !perPage) {
      return res.status(400).json({ msg: "Page and perPage are required" });
    }
    const candidateData = await Candidates.findOne({ userId: userId });
    if (!candidateData) {
      return res.status(404).json({ msg: "Candidate not found" });
    }
    const candidateId = candidateData.id;
    const jobCategoryId = candidateData?.professional?.jobCategoryId;
    const industriesId = candidateData?.industries_relation?.[0]?.industriesId;
    // Extract candidate professional details for matching
    const candidatePro = candidateData.professional || {};
    const expectedSalary = candidatePro.expectedsalary || 0;
    const candidateExperience = (() => {
      const exp = candidatePro.experienceInyear;
      // Handle formats like "0-1 year" or "3.5"
      if (!exp || typeof exp !== "string") return 0;
      // Attempt to extract number from start of string (e.g. "0-1 year" => 0)
      const match = exp.match(/^(\d+(\.\d+)?)/);
      if (match) {
        return parseFloat(match[1]);
      }
      // fallback for just number string
      const asNum = parseFloat(exp);
      return isNaN(asNum) ? 0 : asNum;
    })();
    const preferredLocation = candidatePro.preferedJobLocation || "";
    const candidateSkills = candidatePro.skill || "";
    const candidateQualifications = candidatePro.highestQualification || "";

    // Build professional match conditions with scoring system
    const matchConditions = {
      $and: [
        {
          $expr: {
            $eq: [
              {
                $cond: {
                  if: {
                    $gte: [
                      {
                        $divide: [
                          { $subtract: [new Date(), "$hotvacancy"] },
                          24 * 60 * 60 * 1000 * process.env.JOB_ACTIVE_DAYS || 30// 30 days in milliseconds
                        ]
                      },
                      process.env.JOB_ACTIVE_DAYS || 30 // Job is active if posted within 30 days
                    ]
                  },
                  then: "Inactive",
                  else: "Active"
                }
              },
              "Active"
            ]
          }
        }
      ]
    };

    // Industry and category matching (core requirements)
    if (jobCategoryId) {
      matchConditions.$and.push({ jobCategoryId: jobCategoryId });
    }
    // if (industriesId) {
    //   matchConditions.$and.push({ industriesId: industriesId });
    // }

    // Find matching job openings with scoring
    const matchingJobs = await JobOpening.aggregate([
      {
        $addFields: {
          status: {
            $cond: {
              if: {
                $gte: [
                  {
                    $divide: [
                      { $subtract: [new Date(), "$hotvacancy"] },
                      24 * 60 * 60 * 1000 * process.env.JOB_ACTIVE_DAYS || 30// 30 days in milliseconds
                    ]
                  },
                  process.env.JOB_ACTIVE_DAYS || 30
                ]
              },
              then: "Inactive",
              else: "Active"
            }
          },
          // Calculate match score
          matchScore: {
            $add: [
              // Industry match (30 points)
              // { $cond: [{ $eq: ["$industriesId", industriesId] }, 30, 0] },

              // Job category match (30 points)
              { $cond: [{ $eq: ["$jobCategoryId", jobCategoryId] }, 30, 0] },

              // Salary match (20 points) - within range or negotiable
              {
                $cond: [
                  {
                    $or: [
                      {
                        $and: [
                          { $lte: ["$salaryRangeStart", expectedSalary] },
                          { $gte: ["$salaryRangeEnd", expectedSalary] }
                        ]
                      },
                      { $eq: ["$negotiable", "yes"] }
                    ]
                  },
                  20,
                  0
                ]
              },

              // Experience match (10 points) - meets or exceeds requirement (handle conversion errors)
              {
                $cond: [
                  {
                    $or: [
                      { $eq: ["$minExperienceYears", null] },
                      { $eq: ["$minExperienceYears", ""] },
                      {
                        $let: {
                          vars: {
                            minExp: {
                              $convert: {
                                input: "$minExperienceYears",
                                to: "double",
                                onError: 0,
                                onNull: 0
                              }
                            }
                          },
                          in: { $lte: ["$$minExp", candidateExperience] }
                        }
                      }
                    ]
                  },
                  10,
                  0
                ]
              },

              // Location match (5 points) - fuzzy location matching
              {
                $cond: [
                  {
                    $or: [
                      { $eq: ["$jobLocation", null] },
                      { $eq: ["$jobLocation", ""] },
                      {
                        $regexMatch: {
                          input: "$jobLocation",
                          regex: new RegExp(preferredLocation, "i")
                        }
                      }
                    ]
                  },
                  5,
                  0
                ]
              },

              // Work type match (5 points) - if workType field exists
              {
                $cond: [
                  {
                    $or: [
                      { $eq: ["$workType", null] },
                      { $eq: ["$workType", ""] },
                      { $eq: ["$workType", candidatePro.workType || ""] }
                    ]
                  },
                  5,
                  0
                ]
              }
            ]
          }
        }
      },
      {
        $match: matchConditions
      },
      {
        $lookup: {
          from: "jobCategory",
          localField: "jobCategoryId",
          foreignField: "id",
          as: "jobCategory"
        }
      },
      {
        $addFields: {
          jobCategory: { $arrayElemAt: ["$jobCategory", 0] }
        }
      },
      // {
      //   $lookup: {
      //     from: "industries",
      //     localField: "industriesId",
      //     foreignField: "id",
      //     as: "industries"
      //   }
      // },
      // {
      //   $addFields: {
      //     industries: { $arrayElemAt: ["$industries", 0] }
      //   }
      // },
      {
        $lookup: {
          from: "clients",
          localField: "userId",
          foreignField: "userId",
          as: "client",
          pipeline: [
            {
              $project: {
                // bannerImage: 1,
                companyName: 1,
                companyowner: 1,
                mobile: 1,
                email: 1,
              },
            },
          ],
        }
      },
      {
        $addFields: {
          client: { $arrayElemAt: ["$client", 0] }
        }
      },
      {
        $lookup: {
          from: "jobapplications",
          let: { jobId: "$id", candidateId: candidateId },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$jobOpeningId", "$$jobId"] },
                    { $eq: ["$candidateId", "$$candidateId"] }
                  ]
                }
              }
            },
            {
              $project: { _id: 1 }
            }
          ],
          as: "jobApplication"
        }
      },
      {
        $addFields: {
          appliedStatus: {
            $cond: {
              if: { $gt: [{ $size: "$jobApplication" }, 0] },
              then: "applied",
              else: "notapplied"
            }
          }
        }
      },
      {
        $project: { jobApplication: 0 }
      },
      {
        $sort: {
          matchScore: -1,
          hotvacancy: -1,
          createdAt: -1
        }
      },
      {
        $skip: (page - 1) * perPage
      },
      {
        $limit: perPage
      }
    ]);

    // Get total count for pagination
    const totalCount = await JobOpening.aggregate([
      {
        $addFields: {
          status: {
            $cond: {
              if: {
                $gte: [
                  {
                    $divide: [
                      { $subtract: [new Date(), "$hotvacancy"] },
                      24 * 60 * 60 * 1000 * process.env.JOB_ACTIVE_DAYS || 30// 30 days in milliseconds
                    ],
                  },
                  process.env.JOB_ACTIVE_DAYS || 30,
                ],
              },
              then: "Inactive",
              else: "Active"
            }
          }
        }
      },
      {
        $match: matchConditions
      },
      {
        $count: "total"
      }
    ]);

    res.json({
      results: matchingJobs,
      total: totalCount[0]?.total || 0,
      page,
      perPage,
      totalPages: Math.ceil((totalCount[0]?.total || 0) / perPage),
      matchCriteria: {
        industry: "Not Required",
        jobCategory: jobCategoryId ? "Required" : "Optional",
        salary: "Within range or negotiable",
        experience: "Meets minimum requirements",
        location: "Fuzzy match preferred location",
        workType: "Match if specified"
      }
    });

  } catch (error) {
    console.error("Error getting matching jobs for candidate:", error);
    res.status(500).json({ msg: "Internal server error" });
  }
};

exports.getSingleCandidateDetails = async (req, res) => {
  try {
    const authUser = req.user;

    if (!authUser || !authUser.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const candidate = await Candidates.findOne({ userId: authUser.id });

    if (!candidate) {
      return res.status(404).json({ error: "Candidate profile not found" });
    }

    return res.json(candidate);
  } catch (error) {
    console.error("getSingleCandidateDetails error", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

const { parseResumeData } = require("../services/resumeParser");
const { getResumeExtractionStatus } = require("../middleware/apiIntegration/configResolver");

exports.getResumeExtractionConfigStatus = async (req, res) => {
  try {
    const resumeExtraction = await getResumeExtractionStatus();
    return res.json({
      success: true,
      resumeExtraction,
    });
  } catch (error) {
    console.error("getResumeExtractionConfigStatus error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to check OCR & API Configuration status",
    });
  }
};

exports.parseResume = async (req, res) => {
  try {
    const resumeExtraction = await getResumeExtractionStatus();
    if (!resumeExtraction.ready) {
      return res.json({
        success: false,
        error: resumeExtraction.message,
        code: "API_CONFIG_NOT_SET",
        missing: resumeExtraction.missing,
      });
    }

    const file = req.files?.resume || req.files?.file;
    if (!file) {
      return res.json({ success: false, error: "No resume file uploaded" });
    }

    const { parsedData, parser, extractionSource, confidence } = await parseResumeData(file.data, file.mimetype);
    return res.json({ success: true, data: parsedData, parser, extractionSource, confidence });
  } catch (error) {
    console.error("parseResume error:", error);
    return res.json({
      success: false,
      error: error.message || "Failed to parse resume",
      code: error.code || "PARSE_RESUME_FAILED",
    });
  }
};

exports.publicParseResume = async (req, res) => {
  try {
    const resumeExtraction = await getResumeExtractionStatus();
    if (!resumeExtraction.ready) {
      return res.json({
        success: false,
        error: resumeExtraction.message,
        code: "API_CONFIG_NOT_SET",
        missing: resumeExtraction.missing,
      });
    }

    const file = req.files?.resume || req.files?.file;
    if (!file) {
      return res.json({ success: false, error: "No resume file uploaded" });
    }

    const { parsedData, parser, extractionSource, confidence } = await parseResumeData(file.data, file.mimetype);
    return res.json({ success: true, data: parsedData, parser, extractionSource, confidence });
  } catch (error) {
    console.error("publicParseResume error:", error);
    return res.json({
      success: false,
      error: error.message || "Failed to parse resume",
      code: error.code || "PARSE_RESUME_FAILED",
    });
  }
};

