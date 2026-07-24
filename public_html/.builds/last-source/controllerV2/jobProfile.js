const { default: mongoose } = require("mongoose");
const JobProfile = require("../models-v2/jobProfile_Mongoose");

exports.createJobProfile = async (req, res) => {
  const data = req.body;
  const objectid = new mongoose.Types.ObjectId();
  await JobProfile.create({ id: objectid, _id: objectid, ...data })
    // .insert(data)
    .then((r) => res.json(r))
    .catch((err) => console.log("jobprofile create err", err));
};

exports.getJobProfile = async (req, res) => {
  try {
    let { page, perPage, ...jobProfileReq } = req.query;
    page = Number(req.query?.page || 1);
    perPage = Number(req.query?.perPage || 10);
    page -= 1;

    skip = Number(page * perPage);  
    console.info("--------------------");
    console.info("page => ", page);
    console.info("perPage => ", perPage);
    console.info("skip => ", skip);
    console.info("--------------------");
    let query = {};
    for (const key in jobProfileReq) {
      query = {
        ...query,
        [key]: { $regex: new RegExp(jobProfileReq[key], "i") },
      };
    }
    const JobProfileFilter = await JobProfile.aggregate([
      {
        $sort: { createdAt: -1 },
      },
      {
        $match: { isdeleted: 0 },
      },
      {
        $match: query,
      },
      // {
      //   $lookup: {
      //     from: "company",
      //     localField: "id",
      //     foreignField: "cId",
      //     as: "company",
      //   },
      // },
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "id",
          as: "users",
          pipeline: [
            {
              $lookup: {
                from: "role",
                localField: "roleId",
                foreignField: "id",
                as: "role",
              },
            },
            {
              $addFields: {
                role: { $arrayElemAt: ["$role", 0] },
              },
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
    console.info("--------------------");
    console.info("JobProfileFilter => ", JobProfileFilter);
    console.info("--------------------");
    res.json(JobProfileFilter);
  } catch (err) {
    console.log("dataa Jobprofile filter errr", err);
    res.json({ msg: err });
  }
};

exports.updateJobProfile = async (req, res) => {
  const id = req.params.id;
  const data = req.body;
  await JobProfile.updateOne({ id: req.params.id }, { ...data })
    // .update(data)
    // .where("id", req.params.id)
    .then((r) => res.json({ msg: "success" }))
    .catch((err) => console.log("jobprofile update err", err));
};

exports.deleteJobProfile = async (req, res) => {
  const id = req.params.id;
  await JobProfile.updateOne({ id: id }, { isdeleted: 1 })
    // .update({ isdeleted: 1 })
    // .where("id", id)
    .then((r) => res.json({ msg: "success" }))
    .catch((err) => console.log("jobprofile delete err", err));
};
