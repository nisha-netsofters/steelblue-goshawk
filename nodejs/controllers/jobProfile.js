const JobProfile = require('../models/JobProfile')

exports.createJobProfile = async (req, res) => {
  const data = req.body
  console.log('data', data)
  await JobProfile.query()
    .insert(data)
    .then((r) => res.json(r))
    .catch((err) => console.log('jobprofile create err', err))
}

exports.getJobProfile = async (req, res) => {
  try {
    let { page, perPage } = req.query
    page -= 1
    const jobProfileFilter = req.body
    const JobProfileFilter = await JobProfile.query()
      .withGraphFetched('company')
      .withGraphFetched('users')
      .andWhere('isdeleted', 0)
      .where((builder) => {
        for (const key in jobProfileFilter) {
          builder.andWhere(key, 'ilike', `%${jobProfileFilter[key]}%`)
        }
      })
      .page(page, perPage)
      .orderBy('created_at', 'desc')


    res.json(JobProfileFilter)
  } catch (err) {
    console.log('dataa Jobprofile filter errr', err)
    res.json({ msg: err })
  }
}

exports.updateJobProfile = async (req, res) => {
  const data = req.body
  await JobProfile.query()
    .update(data)
    .where('id', req.params.id)
    .then((r) => res.json({ msg: 'success' }))
    .catch((err) => console.log('jobprofile update err', err))
}

exports.deleteJobProfile = async (req, res) => {
  const id = req.params.id
  await JobProfile.query()
    .update({ isdeleted: 1 })
    .where('id', id)
    .then((r) => res.json({ msg: 'success' }))
    .catch((err) => console.log('jobprofile delete err', err))
}