const Industries = require("../models-v2/industries_Mongoose");

exports.createIndustries = async (req, res) => {
  const data = req.body;
  try {
    const industries = await Industries.create(data);
    industries.id = industries._id;
    industries.save();
    res.json(industries);
  } catch (error) {
    console.log("industries create", err);
  }
};

exports.updateIndustries = async (req, res) => {
  const id = req.params.id;
  const data = req.body;
  await Industries.updateOne({ id }, data)

    .then(() => res.json({ msg: "success" }))
    .catch((err) => console.log("industries update", err));
};

exports.getIndustries = async (req, res) => {
  const page = Number(req.query?.page || 1);
  const perPage = Number(req.query?.perPage || 10);
  const skip = (page - 1) * perPage;
  try {
    const industariesFilter = req.body;
    let query = {};
    if (industariesFilter?.industryCategory) {
      query.industryCategory = {
        $regex: new RegExp(industariesFilter?.industryCategory, "i"),
      };
    }
    const industriesFilterData = await Industries.aggregate([
      {
        $match: query,
      },
      { $skip: skip },
      { $limit: perPage },
      { $sort: { createdAt: -1 } },
    ]);
    const count = await Industries.countDocuments(query);
    // const JobCategoryFilterData = await JobCategory.query()
    //   .page(page, perPage)
    //   .andWhere('isdeleted', 0)
    //   .where((builder) => {
    //     for (const key in jobCategoryFilter) {
    //       builder.andWhere(key, 'ilike', `%${jobCategoryFilter[key]}%`)
    //     }
    //   })
    //   .orderBy('created_at', 'desc')

    res.json({ results: industriesFilterData, total: count });
  } catch (err) {
    console.log("dataa industries filter errr", err);
    res.json({ msg: err });
  }
};

exports.getAllIndustries = async (req, res) => {
  try {
    const industriesData = await Industries.aggregate([
      {
        $sort: { createdAt: -1 },
      },
    ]);
    res.json(industriesData);
  } catch (err) {
    console.log("dataa industries filter errr", err);
    res.json({ msg: err });
  }
};

exports.deleteIndustries = async (req, res) => {
  const id = req.params.id;
  await Industries.deleteOne({ id: id })
    .then((r) => res.json({ msg: "success" }))
    .catch((err) => console.log("industries delete", err));
};
