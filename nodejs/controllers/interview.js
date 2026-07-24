const Interviews = require('../models/Interviews')
const Candidate = require('../models/Candidate');
const User = require('../models/User');

exports.createInterviews = async (req, res) => {
  const data = req.body

  let interviewStatus = data?.candidate?.interviewStatus
  if (interviewStatus === undefined) {
    interviewStatus = 'scheduled'
  }
  delete data?.interviewStatus

  await Interviews.query()
    .insert(data)
    .then((r) => {
      Candidate.query()
        .update({
          interviewStatus,
          interviewerId: data?.userId,
          interviewStatusUpdate: new Date().toISOString(),
        })
        .where('id', data?.candidateId)
        .then(res.json(r))
    })
    .catch((err) => console.log('interview create err', err))
}

exports.updateInterviews = async (req, res) => {
  const data = req.body
  await Interviews.query()
    .upsertGraph(data)
    .then((r) => res.json({ msg: 'success' }))
    .catch((err) => console.log('interview update', err))
}

exports.getInterviews = async (req, res) => {
  try {
    const interviewFilter = req.body

    let { page, perPage, userId } = req.query
    page -= 1
    const field = [
      'onBoardingId',
      "candidateId",
      "userId",

      // "created_at"
    ]
    let user = null
    if (userId !== undefined) {
      user = await User.query().findById(userId).withGraphFetched("role")
    }
    var start, end = {}
    if (interviewFilter?.created_at?.length > 0) {

      start = new Date(interviewFilter?.created_at);
      start.setUTCHours(0, 0, 0, 0);

      end = new Date(interviewFilter?.created_at);
      end.setUTCHours(23, 59, 59, 999);
    }
    const interviewsFilter = await Interviews.query()
      .where('isdeleted', 0)
      .page(page, perPage)
      .withGraphFetched('onBoarding')
      .withGraphFetched('candidate')
      .withGraphFetched('client')
      .withGraphFetched("users")
      .where((builder) => {
        if (userId?.length > 0 && user?.role?.name === "Recruiter" && userId !== undefined && user !== null) {
          builder.andWhere("userId", userId)
        }
      })
      .where((builder) => {

        for (const key in interviewFilter) {
          if (field.includes(key)) {
            builder.andWhere(key, `${interviewFilter[key]}`)
          } else if (key === "scheduledby") {
            builder.andWhere("userId", interviewFilter[key])
          } else if (key === "created_at") {
            builder.andWhereBetween(key, [start, end])
          } else if (key === "mobile" || key === "interviewStatus") {
            builder.whereExists(
              Interviews.relatedQuery('candidate').where(
                key, "like",
                `%${interviewFilter[key]}%`,
              )
            )
          } else {
            builder.andWhere(key, 'ilike', `%${interviewFilter[key]}%`)
          }
        }
      })
      .orderBy('created_at', 'desc')


    res.json(interviewsFilter)
  } catch (err) {
    console.log('dataa interviews filter errr', err)
    res.json({ msg: err })
  }
}
exports.deleteInterviews = async (req, res) => {
  const id = req.params.id
  const interview = await Interviews.query().findById(id)

  await Interviews.query()
    .deleteById(id)
    .then(async (r) => {
      await Candidate.query()
        .update({ interviewStatus: 'available', interviewerId: null })
        .where('id', interview?.candidateId)
        .then(res.json({ msg: 'success' }))
    })
    .catch((err) => console.log('interview delete', err))
}

// exports.deleteInterviews = async (req, res) => {
//   const id = req.params.id
//   await Interviews.query()
//     .update({ isdeleted: 1 })
//     .where('id', id)
//     .then((r) => res.json({ msg: 'success' }))
//     .catch((err) => console.log('interview delete', err))
// }

// exports.filterInterviews = async (req, res) => {
//   try {
//     const interviewFilter = req.body

//     const interviewsFilter = await Interviews.query()
//       .where('isdeleted', 0)
//       .withGraphFetched('company')
//       .withGraphFetched('candidate')
//       .where((builder) => {
//         for (const key in interviewFilter) {
//           builder.andWhere(key, 'ilike', `%${interviewFilter[key]}%`)
//         }
//       })
//     res.json(interviewsFilter)
//   } catch (err) {
//     console.log('dataa interviews filter errr', err)
//     res.json({ msg: err })
//   }
// }
