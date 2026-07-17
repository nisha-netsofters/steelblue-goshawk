const Candidate = require('./../models/Candidate')
const OnBoarding = require('./../models/onBoarding')
const Role = require('../models/Role')
const Interviews = require('../models/Interviews')
const User = require('../models/User')
// const { initialize } = require('objection');
const moment = require('moment')
const { ref } = require('objection')
const { raw } = require('objection')

exports.dashboard = async (req, res) => { }

exports.statistics = async (req, res) => {
  let month = Number(req.query.month)
  let year = req.query.year
  let from = new Date(`${year}-${month}-01`)
  month += 1
  if (Number(req.query.month) === 12) {
    year = Number(year) + 1
    month = 01;
  }
  let to = new Date(`${year}-${month}-01`)
  if (req.query.month == 'null') {
    from = new Date(`${year}-01-01`)
    to = new Date(`${year}-12-31`)
  }
  let data = {
    candidate: 0,
    OnBoarding: 0,
    scheduled: 0,
    hired: 0,
    rejected: 0,
    completed: 0,
  }
  const userId = req?.query?.userId
  const user = await User.query().findById(userId).withGraphFetched('role')
  const InterviewStatus = ['scheduled', 'hired', 'rejected', 'completed']

  await Candidate.query()
    .whereBetween('created_at', [from, to])
    .count()
    .then((response) => {
      data.candidate = response[0]?.count
    })

  for (var i = 0; i < 4; i++) {
    await Candidate.query()
      .where((builder) => {
        if (user?.role?.name === 'Recruiter') {
          builder.where('userId', '=', userId)
        }
      })
      .whereBetween('interviewStatusUpdate', [from, to])
      .andWhere('interviewStatus', InterviewStatus[i])
      .count()
      .then((response) => {
        data[InterviewStatus[i]] = response[0]?.count
      })
  }
  await OnBoarding.query()
    .where((builder) => {
      if (user?.role?.name === 'Recruiter') {
        builder.where('userId', '=', userId)
      }
    })
    .whereBetween('created_at', [from, to])
    .count()
    .then((response) => {
      data.OnBoarding = response[0]?.count
    })

  try {
    res.json(data)
  } catch (error) {
    console.log('Dashboard statistics error', error)
  }
}

exports.recruitorsWork = async (req, res) => {
  let month = Number(req.query.month) + 1
  let year = req.query.year
  const from = new Date(`${year}-${month}-01`)
  month += 1
  if (Number(req.query.month) === 11) {
    year = Number(year) + 1
    month = 01
  }
  const to = new Date(`${year}-${month}-01`)
  try {
    let users = await User.query()
      .withGraphJoined('[role, interviews]')
      .andWhere('role.name', 'Recruiter')
      .whereBetween('interviews.created_at', [from, to])
      .select([
        'users.*',
        Candidate.query()
          .where('interviewerId', ref('interviews.userId'))
          .andWhereBetween('interviewStatusUpdate', [from, to])
          .andWhere('interviewStatus', 'hired')
          .count()
          .as('hired'),
      ])
      .select([
        Candidate.query()
          .where('interviewerId', ref('interviews.userId'))
          .andWhere('interviewStatus', 'scheduled')
          .andWhereBetween('interviewStatusUpdate', [from, to])
          .count()
          .as('scheduled'),
      ])
      .select([
        Candidate.query()
          .where('interviewerId', ref('interviews.userId'))
          .andWhere('interviewStatus', 'rejected')
          .andWhereBetween('interviewStatusUpdate', [from, to])
          .count()
          .as('rejected'),
      ])

    res.json(users)
  } catch (error) {
    console.log('dashboard graph', error)
  }
}

exports.interviews = async (req, res) => {
  const date = new Date()
  let year = date.getFullYear()
  const from = new Date(`${year}-01-01`)
  const to = new Date(`${year}-12-31`)
  let data = []
  await Interviews.query()
    .whereBetween('interviews.created_at', [from, to])
    .select([raw(`DATE_TRUNC('month',interviews.created_at)`).as('months')])
    .count('*')
    .join('candidates', 'interviews.candidateId', '=', 'candidates.id')
    .where('interviewStatus', '=', 'scheduled')
    .groupBy(['months'])
    .orderBy(['months'])
    .then((resp) => {
      let array = []
      for (var i = 0; i < 12; i++) {
        array.push('0')
      }
      resp.forEach((ele, i) => {
        const months = new Date(ele?.months).getMonth()
        array[months] = ele?.count
      })
      data.push({
        scheduled: array,
      })
    })

  await Interviews.query()
    .whereBetween('interviews.created_at', [from, to])
    .select([raw(`DATE_TRUNC('month',interviews.created_at)`).as('months')])
    .count('*')
    .join('candidates', 'interviews.candidateId', '=', 'candidates.id')
    .where('interviewStatus', '=', 'hired')
    .groupBy(['months'])
    .orderBy(['months'])
    .then((resp) => {
      let array = []
      for (var i = 0; i < 12; i++) {
        array.push('0')
      }
      resp.forEach((ele, i) => {
        const months = new Date(ele?.months).getMonth()
        array[months] = ele?.count
      })
      data.push({
        hired: array,
      })
    })

  await Interviews.query()
    .whereBetween('interviews.created_at', [from, to])
    .select([raw(`DATE_TRUNC('month',interviews.created_at)`).as('months')])
    .count('*')
    .join('candidates', 'interviews.candidateId', '=', 'candidates.id')
    .where('interviewStatus', '=', 'rejected')
    .groupBy(['months'])
    .orderBy(['months'])
    .then((resp) => {
      let array = []
      for (var i = 0; i < 12; i++) {
        array.push('0')
      }
      resp.forEach((ele, i) => {
        const months = new Date(ele?.months).getMonth()
        array[months] = ele?.count
      })
      data.push({
        rejected: array,
      })
    })
  res.json(data)
}

exports.todayInterviews = async (req, res) => {
  const userId = req?.query?.userId

  const date = moment().format('L')
  const interviews = await Interviews.query()
    .withGraphFetched("users.role")
    .withGraphJoined('candidate')
    .where("candidate.interviewStatus", "scheduled")
    .where('interviews.date', '=', date)
    .where((builder) => {
      if (userId?.length > 0) {
        builder.andWhere("interviews.userId", userId)
      }
    })
  res.json(interviews)
}

exports.candidates = async (req, res) => {
  const data = await Candidate.query()
    .withGraphFetched('professional.jobCategory')
    // .where('status', 'new')
    .withGraphFetched("industries_relation.industries")
    .orderBy('status', 'new')
    .orderBy('created_at', 'desc')
    .limit(15)
  res.json(data)
}
