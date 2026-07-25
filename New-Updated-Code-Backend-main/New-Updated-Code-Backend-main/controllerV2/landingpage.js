const Clients = require("../models-v2/clients_Mongoose");
// const User = require("../models/User");
const Candidate = require("../models-v2/candidates_Mongoose");
const Users = require("../models-v2/users_Mongoose");
const Candidates = require("../models-v2/candidates_Mongoose");
const JobCategory = require("../models-v2/jobCategory_Mongoose");
const { default: mongoose } = require("mongoose");
const Industries = require("../models-v2/industries_Mongoose");
const Agency = require("../models-v2/agency_Mongooes");
const Role = require("../models-v2/role_Mongoose");

exports.getCandidatesstats = async (req, res) => {
  const agencyId = req.headers["agencyid"];
  const userId = req.headers.userid;

  let filterForUserCount = {};
  if (agencyId) {
    filterForUserCount = {
      ...filterForUserCount,
      agencyId: agencyId,
    };
    filterForUserCount = {
      ...filterForUserCount,
      action: "approved",
    };
  }

  const users = await Clients.aggregate([
    {
      $match: filterForUserCount,
    },
    {
      $count: "count",
    },
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
  }

  const candidate = await Candidate.aggregate([
    {
      $lookup: {
        from: "agency",
        localField: "agencyId",
        foreignField: "id",
        as: "agency",
      },
    },
    {
      $addFields: {
        agency: { $arrayElemAt: ["$agency", 0] },
      },
    },
    ...pipelineCandidate,
    {
      $count: "count",
    },
  ]);
  try {
    res.json({
      employer: [{ count: users[0]?.count || 0 }],
      employee: [{ count: candidate[0]?.count || 0 }],
    });
  } catch (error) {
    console.log("Candidate Filter", error);
  }
};
exports.updateUserForCandidateApply = async (req, res) => {
  let {
    _id,
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
    candidate.image = `${resp.url}`;
  }
  if (req?.files?.resume) {
    let resp = await awsUploadFiles(req?.files?.resume);
    // let resp = await fileUpload(req.files.resume)
    candidate.resume = `${resp.url}`;
  }

  try {
    professional = JSON.parse(req.body.professional);

    let jobCategoryId = professional.jobCategoryId;

    const jobCategories = await JobCategory.find({ id: jobCategoryId });

    professional = {
      ...professional,
      jobCategory: jobCategories[0],
    };

    if (industries_relation?.length > 0) {
      let industriesIdlist = JSON.parse(industries_relation)?.map(
        (item) => item?.industriesId
      );
      const industries_relationlist = [];
      for (let index = 0; index < industriesIdlist.length; index++) {
        const element = industriesIdlist[index];
        let objectid = new mongoose.Types.ObjectId();
        industries_relationlist.push({
          _id: objectid,
          id: objectid,
          createdAt: new Date(),
          cId: id,
          industriesId: element,
          industries: await Industries.findOne({ id: element }),
        });
      }

      await Candidates.updateOne(
        { id: id },
        {
          $set: {
            industries_relation: industries_relationlist,
            professional,
            ...candidate,
          },
        }
      );
    } else {
      await Candidates.updateOne(
        { id: id },
        {
          $set: {
            professional,
            ...candidate,
          },
        }
      );
    }

    res.json({ msg: "success" });
  } catch (err) {
    console.log("candidate update", err);
    res.json({ columns: err?.columns, constraint: err?.constraint });
  }
};
