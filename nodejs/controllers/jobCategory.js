const JobCategory = require('../models/JobCategory')

exports.createJobCategory = async (req, res) => {
  const data = req.body
  await JobCategory.query()
    .insert(data)
    .then((r) => res.json(r))
    .catch((err) => console.log('jobCategory create', err))
}

exports.updateJobCategory = async (req, res) => {
  const id = req.params.id
  const data = req.body
  await JobCategory.query()
    .update(data)
    .where('id', id)

    .then(() => res.json({ msg: "success" }))
    .catch((err) => console.log('jobCategory update', err))
}

exports.getjobCategories = async (req, res) => {
  let { page, perPage } = req.query
  page -= 1
  try {
    const jobCategoryFilter = req.body
    const JobCategoryFilterData = await JobCategory.query()
      .page(page, perPage)
      .andWhere('isdeleted', 0)
      .where((builder) => {
        for (const key in jobCategoryFilter) {
          builder.andWhere(key, 'ilike', `%${jobCategoryFilter[key]}%`)
        }
      })
      .orderBy('created_at', 'desc')



    res.json(JobCategoryFilterData)
  } catch (err) {
    console.log('dataa Jobprofile filter errr', err)
    res.json({ msg: err })
  }
}

exports.getAllJobCategories = async (req, res) => {

  try {
    const JobCategoryData = await JobCategory.query()
      .page()

    res.json(JobCategoryData)
  } catch (err) {
    console.log('dataa Jobprofile filter errr', err)
    res.json({ msg: err })
  }
}

exports.deleteJobCategory = async (req, res) => {
  const id = req.params.id
  await JobCategory.query().deleteById(id)
    .then((r) => res.json({ msg: "success" }))
    .catch((err) => console.log('jobCategory delete', err))
}
