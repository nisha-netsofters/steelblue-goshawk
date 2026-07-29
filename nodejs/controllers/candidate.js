const Candidate = require("../models/Candidate");
const Professional = require("../models/Professional");
const Education = require("../models/Education");
const Experience = require("../models/Experience");
const fs = require("fs");
const { fileUpload } = require("../middleware/contentful");
const {
  sendcandidateRegistrationSuccessfully,
  sendtoAllClientmailAdded,
  newCandidatewelcomeEmail,
  sendBulkMail,
} = require("../middleware/Emails/email");
const Industries_Relation = require("../models/Industries_Relation");
const JobCategory_Relation = require("../models/JobCategory_Relation");
const Clients = require("../models/Clients");
const { awsUploadFiles } = require("../middleware/awsS3");
const { raw } = require("objection");
const { sendWhatsappMSG } = require("../middleware/whatsappMSG/whatsapp");
const { enqueueEmailJob } = require("../mq/emailProducer");

exports.createCandidatesCsvFile = async (req, res) => {
  try {
    const candidate_Data = await Candidate.query().upsertGraph(req.body, {
      insertMissing: true,
    });
    res.json({ candidate_Data, msg: "success" });
  } catch (err) {
    console.info("----------------------------");
    console.info("candidate create err =>", err);
    console.info("----------------------------");
    res.json({ columns: err?.columns, constraint: err?.constraint });
  }
};

exports.createCandidates = async (req, res) => {
  let candidate = req.body;
  if (req?.files?.image) {
    // let resp = await fileUpload(req.files.image)
    let resp = await awsUploadFiles(req.files.image);
    candidate.image = `${resp.url}`;
  }
  if (req?.files?.resume) {
    let resp = await awsUploadFiles(req.files.resume);
    // let resp = await fileUpload(req.files.resume)
    candidate.resume = `${resp.url}`;
  }

  let clients = [];
  try {
    if (candidate?.professional)
      candidate.professional = JSON.parse(req.body.professional);
    // if (candidate?.industries_relation && candidate?.professional?.jobCategory) {
    const industriesId = [];
    candidate.industries_relation = JSON.parse(req.body.industries_relation);
    candidate.industries_relation?.filter((ele) => {
      industriesId.push(ele?.industriesId);
    });
    clients = await Clients.query()
      .withGraphJoined("industries_relation")
      .withGraphJoined("jobCategory_relation")
      .where("action", "=", "approved")
      // where(function() {
      //   this.where("city", "=", candidate?.city).orWhere("industries_relation.industriesId", industriesId)
      // }).orWhere("jobCategory_relation.jobCategoryId", [candidate?.professional?.jobCategoryId])
      .where("city", "=", candidate?.city)
      .whereIn("industries_relation.industriesId", industriesId)
      .orWhereIn("jobCategory_relation.jobCategoryId", [
        candidate?.professional?.jobCategoryId,
      ]);
    // }

    await Candidate.query()
      .insertGraph(candidate)
      .withGraphFetched("allIndustries")
      .withGraphFetched("professional.jobCategory")
      .then(async (data) => {
        res.json(data);
        await enqueueEmailJob("candidateRegistrationSuccess", {
          candidate: data,
          emailTo: process.env.INTERVIEW_REQUEST || process.env.REACT_APP_USER,
        });
        // Optional welcome + fan-out
        // await enqueueEmailJob("candidateWelcome", { candidate: data });
        if (clients?.length > 0) {
          await enqueueEmailJob("bulkCandidatesToClients", {
            clientsEmail: clients,
            candidate: data,
            agencyName: "",
          });
        }
      });
  } catch (err) {
    console.log("dataa candidate create errr", err);
    res.json({ columns: err?.columns, constraint: err?.constraint });
  }
};

exports.deleteCandidate = async (req, res) => {
  const id = req.params.id;
  try {
    await Candidate.query().deleteById(id);
    await Professional.query().delete().where("candidateId", id);
    await Industries_Relation.query().delete().where("c_Id", id);
    res.json({ msg: "success" });
  } catch (error) {
    console.log("delete candidate", error);
    res.json({ msg: "delete candidate err" });
  }
};

exports.candidateUpdate = async (req, res) => {
  const candidate = req.body;
  // delete candidate.industries_relation

  delete candidate.userId;
  if (candidate?.interviewerId == "null") {
    delete candidate?.interviewerId;
  }
  if (candidate?.jobOpeningId == "null") {
    delete candidate?.jobOpeningId;
  }

  if (req?.files?.image) {
    let resp = await awsUploadFiles(req?.files?.image);
    candidate.image = `${resp.url}`;
  }
  if (req?.files?.resume) {
    let resp = await awsUploadFiles(req?.files?.resume);
    // let resp = await fileUpload(req.files.resume)
    candidate.resume = `${resp.url}`;
  }
  // Never allow profile edits to reset WhatsApp delivery flags.
  if (Object.prototype.hasOwnProperty.call(candidate, "whatsappMsg")) {
    delete candidate.whatsappMsg;
  }
  // Editing profile should mark message flow as already handled.
  candidate.whatsappMsg = true;

  try {
    if (candidate?.professional?.length > 0)
      candidate.professional = JSON.parse(req.body.professional);
    if (candidate?.industries_relation) {
      candidate.industries_relation = JSON.parse(req.body.industries_relation);
      candidate.industries_relation.filter((ele) => {
        delete ele.value;
        delete ele.label;
        return ele;
      });
    }
    //candidate
    await Candidate.query().upsertGraph(candidate, {
      relate: true,
      insertMissing: true,
    });

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

  let industriesId = [];
  let jobCategoryId = [];
  let filterJobCategoryId = [];
  const candidateDetails = [
    "firstname",
    "lastname",
    "email",
    "mobile",
    "city",
    "cityId",
    "stateId",
    "state",
  ];
  const professional = ["expectedsalary", "experienceInyear", "currentSalary"];
  const textField = [
    "noticePeriod",
    "course",
    "field",
    "preferedJobLocation",
    "english",
    "currentlyWorking",
    "designation",
    "highestQualification",
  ];
  let select = [];

  if (basicDetails?.filterJobCategoryId) {
    filterJobCategoryId = JSON.parse(basicDetails.filterJobCategoryId);
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
    if (basicDetails?.industriesId) {
      industriesId = JSON.parse(basicDetails.industriesId);
    }
  }
  if (
    basicDetails?.jobCategoryId?.length > 0 &&
    filterJobCategoryId.length === 0
  ) {
    jobCategoryId = JSON.parse(basicDetails.jobCategoryId);
  }
  delete basicDetails?.industriesId;
  delete basicDetails?.jobCategoryId;

  const candidate = await Candidate.query()
    .withGraphFetched("interviews.users.role")
    .withGraphFetched(
      "[professional.jobCategory,industries_relation.industries]"
    )
    .select(select)
    .where((builder) => {
      builder.andWhere((builder1) => {
        if (jobCategoryId?.length > 0) {
          builder1.whereExists(
            Candidate.relatedQuery("professional").whereIn(
              "jobCategoryId",
              jobCategoryId
            )
          );
        }
      });
      for (const key in basicDetails) {
        if (key === "gender") {
          builder.andWhere(key, "=", `${basicDetails[key]}`);
        } else if (key === "industries") {
          builder.andWhere((builder) => {
            if (basicDetails?.industries) {
              builder.whereExists(
                Candidate.relatedQuery("industries_relation").whereIn(
                  "industriesId",
                  basicDetails[key]
                )
              );
            }
          });
        } else if (key == "userId" && select?.length > 0) {
          builder.andWhere(`candidates.${key}`, basicDetails[key]);
          builder.andWhere(`candidates.interviewStatus`, "!=", "hired");
          //industries wise Candidate and filters for client
          builder.orWhere((builder1) => {
            if (industriesId?.length > 0) {
              builder1.whereExists(
                Candidate.relatedQuery("industries_relation")
                  .whereIn("industriesId", industriesId)
                  .where(`candidates.interviewStatus`, "!=", "hired")
              );
            }
            if (filterJobCategoryId?.length > 0) {
              builder1.whereExists(
                Candidate.relatedQuery("professional").whereIn(
                  "jobCategoryId",
                  filterJobCategoryId
                )
              );
            }
            for (const val in basicDetails) {
              if (candidateDetails.includes(val)) {
                builder1.andWhere(
                  `candidates.${val}`,
                  "ilike",
                  `%${basicDetails[val]}%`
                );
              }
            }
            if (basicDetails?.gender) {
              builder1.andWhere("gender", "=", basicDetails?.gender);
            }
          });

          builder.orWhere((builder1) => {
            if (jobCategoryId?.length > 0 && basicDetails?.userId?.length > 0) {
              builder1.whereExists(
                Candidate.relatedQuery("professional")
                  .whereIn("jobCategoryId", jobCategoryId)
                  .where(`candidates.interviewStatus`, "!=", "hired")
              );
            }
            if (filterJobCategoryId?.length > 0) {
              builder1.whereExists(
                Candidate.relatedQuery("professional").whereIn(
                  "jobCategoryId",
                  filterJobCategoryId
                )
              );
            }
            for (const val in basicDetails) {
              if (candidateDetails.includes(val)) {
                builder1.andWhere(
                  `candidates.${val}`,
                  "ilike",
                  `%${basicDetails[val]}%`
                );
              }
            }
            if (basicDetails?.gender) {
              builder1.andWhere("gender", "=", basicDetails?.gender);
            }
          });
        } else if (key == "comments") {
          builder.andWhere(
            `candidates.${key}`,
            "ilike",
            `%${basicDetails[key]}%`
          );
        } else if (candidateDetails.includes(key)) {
          builder.andWhere(
            `candidates.${key}`,
            "ilike",
            `%${basicDetails[key]}%`
          );
        }
      }
    })

    .andWhere((builder) => {
      for (const key in basicDetails) {
        if (professional.includes(key)) {
          builder.whereExists(
            Candidate.relatedQuery("professional").where(
              `${key}`,
              basicDetails[key]
            )
          );
        } else if (key === "jobCategoryId") {
          builder.whereExists(
            Candidate.relatedQuery("professional").whereIn(
              `${key}`,
              basicDetails[key]
            )
          );
        }
        if (textField.includes(key)) {
          builder.whereExists(
            Candidate.relatedQuery("professional").where(
              `${key}`,
              "ilike",
              `%${basicDetails[key]}%`
            )
          );
        }
      }
    })
    .page(page, perPage)
    .orderBy("status", "asc")
    .orderBy("created_at", "desc");

  try {
    res.json(candidate);
  } catch (error) {
    console.log("Candidate Filter", error);
  }
};

//candidate view update
exports.candidateView = async (req, res) => {
  const id = req.params.id;
  await Candidate.query()
    .update({ status: "view" })
    .where("id", id)
    .then(() => res.json({ msg: "success" }));
};

exports.checkCandidate = async (req, res) => {
  const { mobile, email } = req.body;

  try {
    let msg = {};
    const mobileData = await Candidate.query().where("mobile", mobile);
    const emailData = await Candidate.query().where("email", email);
    if (emailData?.length > 0) {
      msg.email = "error";
    }

    if (mobileData?.length > 0) {
      msg.mobile = "error";
    }
    res.json(msg);
  } catch (err) {
    console.info("----------------------------");
    console.info(" check Candidate err =>", err);
    console.info("----------------------------");
  }
};

exports.hiredCandidateforClients = async (req, res) => {
  const onBoardingId = req?.query?.id;
  let { page, perPage } = req.query;
  page -= 1;
  const candidate = await Candidate.query()
    .withGraphFetched("professional.jobCategory")
    .withGraphJoined("interviews")
    .where("interviews.onBoardingId", "=", onBoardingId)
    .andWhere("interviewStatus", "=", "hired")
    .page(page, perPage)
    .orderBy("status", "aesc");
  try {
    res.json(candidate);
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
    const candidate = await Candidate.query()

      .andWhere((builder) => {
        // if (industriesId?.length > 0 && basicDetails?.userId?.length > 0) {
        //   builder.whereExists(
        //     Candidate.relatedQuery('industries_relation').whereIn(
        //       'industriesId',
        //       industriesId,
        //     ),
        //   )
        if (basicDetails?.userId) {
          builder.andWhere("candidates.userId", "=", basicDetails?.userId);
          builder.andWhere(`candidates.interviewStatus`, "!=", "hired");
        }
        // }
      })
      .page(page, perPage)
      .orderBy("status", "asc")
      .orderBy("created_at", "desc");
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

  let industriesId = [];
  let jobCategoryId = [];
  let filterJobCategoryId = [];
  const candidateDetails = [
    "firstname",
    "lastname",
    "email",
    "mobile",
    "city",
    "cityId",
    "stateId",
    "state",
  ];
  const professional = ["expectedsalary", "experienceInyear", "currentSalary"];
  const textField = [
    "noticePeriod",
    "course",
    "field",
    "preferedJobLocation",
    "english",
    "currentlyWorking",
    "designation",
    "highestQualification",
  ];

  if (basicDetails?.filterJobCategoryId) {
    filterJobCategoryId = JSON.parse(basicDetails.filterJobCategoryId);
    delete basicDetails?.filterJobCategoryId;
  }

  let select = [
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
  if (basicDetails?.industriesId) {
    industriesId = JSON.parse(basicDetails.industriesId);
  }

  if (
    basicDetails?.jobCategoryId?.length > 0 &&
    filterJobCategoryId.length === 0
  ) {
    jobCategoryId = JSON.parse(basicDetails.jobCategoryId);
  }
  delete basicDetails?.industriesId;
  delete basicDetails?.jobCategoryId;

  const candidate = await Candidate.query()
    .withGraphFetched("interviews.users.role")
    .withGraphFetched(
      "[professional.jobCategory,industries_relation.industries]"
    )
    .withGraphFetched("[interview_request]")
    .modifyGraph("interview_request", (builder) => {
      builder.where("userId", basicDetails?.userId);
      builder.select([
        "*",
        raw(
          `created_at > NOW() - INTERVAL '${process.env.INTERVIEW_REQUEST_DURATION}' AS isDisabled`
        ),
      ]);
      builder.orderBy("created_at", "DESC");
    })
    // .select(select)
    .where((builder) => {
      builder.andWhere((builder1) => {
        if (jobCategoryId?.length > 0) {
          builder1.whereExists(
            Candidate.relatedQuery("professional").whereIn(
              "jobCategoryId",
              jobCategoryId
            )
          );
        }
      });
      for (const key in basicDetails) {
        if (key === "gender") {
          builder.andWhere(key, "=", `${basicDetails[key]}`);
        } else if (key === "industries") {
          builder.andWhere((builder) => {
            if (basicDetails?.industries) {
              builder.whereExists(
                Candidate.relatedQuery("industries_relation").whereIn(
                  "industriesId",
                  basicDetails[key]
                )
              );
            }
          });
        } else if (key == "userId" && select?.length > 0) {
          builder.andWhere(`candidates.${key}`, basicDetails[key]);
          builder.andWhere(`candidates.interviewStatus`, "!=", "hired");
          //industries wise Candidate and filters for client
          builder.orWhere((builder1) => {
            if (industriesId?.length > 0) {
              builder1.whereExists(
                Candidate.relatedQuery("industries_relation")
                  .whereIn("industriesId", industriesId)
                  .where(`candidates.interviewStatus`, "!=", "hired")
              );
            }
            if (filterJobCategoryId?.length > 0) {
              builder1.whereExists(
                Candidate.relatedQuery("professional").whereIn(
                  "jobCategoryId",
                  filterJobCategoryId
                )
              );
            }
            for (const val in basicDetails) {
              if (candidateDetails.includes(val)) {
                builder1.andWhere(
                  `candidates.${val}`,
                  "ilike",
                  `%${basicDetails[val]}%`
                );
              }
            }
            if (basicDetails?.gender) {
              builder1.andWhere("gender", "=", basicDetails?.gender);
            }
          });

          builder.orWhere((builder1) => {
            if (jobCategoryId?.length > 0 && basicDetails?.userId?.length > 0) {
              builder1.whereExists(
                Candidate.relatedQuery("professional")
                  .whereIn("jobCategoryId", jobCategoryId)
                  .where(`candidates.interviewStatus`, "!=", "hired")
              );
            }
            if (filterJobCategoryId?.length > 0) {
              builder1.whereExists(
                Candidate.relatedQuery("professional").whereIn(
                  "jobCategoryId",
                  filterJobCategoryId
                )
              );
            }
            for (const val in basicDetails) {
              if (candidateDetails.includes(val)) {
                builder1.andWhere(
                  `candidates.${val}`,
                  "ilike",
                  `%${basicDetails[val]}%`
                );
              }
            }
            if (basicDetails?.gender) {
              builder1.andWhere("gender", "=", basicDetails?.gender);
            }
          });
        } else if (key == "comments") {
          builder.andWhere(
            `candidates.${key}`,
            "ilike",
            `%${basicDetails[key]}%`
          );
        } else if (candidateDetails.includes(key)) {
          builder.andWhere(
            `candidates.${key}`,
            "ilike",
            `%${basicDetails[key]}%`
          );
        }
      }
    })
    .andWhere((builder) => {
      if (isSavedCandidates == "true" || isSavedCandidates == true) {
        builder.whereExists(
          Candidate.relatedQuery("saved_Candidates").where(
            "userId",
            basicDetails?.userId
          )
        );
      }
    })
    .andWhere((builder) => {
      for (const key in basicDetails) {
        if (professional.includes(key)) {
          builder.whereExists(
            Candidate.relatedQuery("professional").where(
              `${key}`,
              basicDetails[key]
            )
          );
        } else if (key === "jobCategoryId") {
          builder.whereExists(
            Candidate.relatedQuery("professional").whereIn(
              `${key}`,
              basicDetails[key]
            )
          );
        }
        if (textField.includes(key)) {
          builder.whereExists(
            Candidate.relatedQuery("professional").where(
              `${key}`,
              "ilike",
              `%${basicDetails[key]}%`
            )
          );
        }
      }
    })
    .page(page, perPage)
    .orderBy("created_at", "desc");

  try {
    res.json(candidate);
  } catch (error) {
    console.log("Candidate Filter", error);
  }
};
