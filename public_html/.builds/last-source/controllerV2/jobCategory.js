const { default: mongoose } = require("mongoose");
const JobCategory = require("../models-v2/jobCategory_Mongoose");

exports.createJobCategory = async (req, res) => {
  const data = req.body;
  const objectid = new mongoose.Types.ObjectId();
  try {
    const jobCategory = await JobCategory.create({
      id: objectid,
      _id: objectid,
      ...data,
    });
    res.json(jobCategory);
  } catch (error) {
    console.log("jobCategory create", err);
  }
};

exports.updateJobCategory = async (req, res) => {
  const id = req.params.id;
  const data = req.body;
  await JobCategory.updateOne({ id }, { $set: data })
    .then(() => res.json({ msg: "success" }))
    .catch((err) => console.log("jobCategory update", err));
};

exports.getjobCategories = async (req, res) => {
  const page = Number(req.query?.page || 1);
  const perPage = Number(req.query?.perPage || 10);
  const skip = (page - 1) * perPage;
  try {
    const jobCategoryFilter = req.body;
    let query = {};
    if (jobCategoryFilter?.jobCategory) {
      query.jobCategory = {
        $regex: new RegExp(jobCategoryFilter?.jobCategory, "i"),
      };
    }
    const JobCategoryFilterData = await JobCategory.aggregate([
      { $sort: { createdAt: -1 } },
      {
        $match: query,
      },
      { $skip: skip },
      { $limit: perPage },
    ]);
    const count = await JobCategory.countDocuments(query);
    res.json({ results: JobCategoryFilterData, total: count });
  } catch (err) {
    console.log("dataa Jobprofile filter errr", err);
    res.json({ msg: err });
  }
};

exports.getAllJobCategories = async (req, res) => {
  try {
    const JobCategoryData = await JobCategory.aggregate([
      { $sort: { createdAt: -1 } },
    ]);
    const count = await JobCategory.countDocuments();
    // res.json({ results: JobCategoryData, total: count });
    res.json({ results: JobCategoryData, total: count });
  } catch (err) {
    console.log("dataa Jobprofile filter errr", err);
    res.json({ msg: err });
  }
};

exports.deleteJobCategory = async (req, res) => {
  const id = req.params.id;
  await JobCategory.deleteOne({ id })
    .then((r) => res.json({ msg: "success" }))
    .catch((err) => console.log("jobCategory delete", err));
};
