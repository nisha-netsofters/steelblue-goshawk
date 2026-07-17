const { fileUpload } = require('../middleware/contentful')
const OnBoarding = require('../models/onBoarding')
const User = require('../models/User')

exports.createOnBoarding = async (req, res) => {
  const data = req.body
  // console.log('data', data)
  // let resp = await fileUpload(req.files.jobDescriptionFile)
  // data.jobDescriptionFile = `https:${resp.url}`
  await OnBoarding.query()
    .insert(data)
    .then((r) => res.json(r))
    .catch((err) => console.log('onBoarding create err', err))
}

exports.getOnBoarding = async (req, res) => {
  try {
    let { page, perPage, userId } = req.query
    page -= 1
    const jobOnBoarding = req.body
    const field = [
      'userId',
      'jobCategoryId',
      'gender',
      'salaryRangeStart',
      'salaryRangeEnd',
    ]

    const userRole = await User.query()
      .findById(userId)
      .withGraphFetched('role')
    const onBoardingFilter = await OnBoarding.query()
      .withGraphFetched('jobCategory')
      .withGraphFetched('industries')
      .withGraphFetched('users')
      .andWhere('isdeleted', 0)
      // .andWhere("userId", userId)
      .where((builder) => {
        if (userRole?.role?.name === 'Recruiter') {
          builder.andWhere('userId', '=', userId)
        }
        for (const key in jobOnBoarding) {
          if (field.includes(key)) {
            builder.andWhere(key, `${jobOnBoarding[key]}`)
          } else {
            builder.andWhere(key, 'ilike', `%${jobOnBoarding[key]}%`)
          }
        }
      })
      .page(page, perPage)
      .orderBy('created_at', 'desc')


    res.json(onBoardingFilter)
  } catch (err) {
    console.log('dataa onBoarding filter errr', err)
    res.json({ msg: err })
  }
}

exports.updateOnBoarding = async (req, res) => {
  const data = req.body
  await OnBoarding.query()
    .update(data)
    .where('id', req.params.id)
    .then((r) => res.json({ msg: 'success' }))
    .catch((err) => console.log('onBoarding update err', err))
}

exports.deleteOnBoarding = async (req, res) => {
  const id = req.params.id
  await OnBoarding.query()
    .deleteById(id)
    .then((r) => res.json({ msg: 'success' }))
    .catch((err) => console.log('onBoarding delete err', err))
}
