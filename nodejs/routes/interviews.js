const router = require('express').Router()

const {
  createInterviews,
  getInterviews,
  deleteInterviews,
  updateInterviews,
  filterInterviews,
} = require('../controllers/interview')
const { verifyAuth } = require('../middleware/auth')

router.post('/interviews/create', verifyAuth, createInterviews)
router.post('/interviews', verifyAuth, getInterviews)
router.delete('/interviews/delete/:id', verifyAuth, deleteInterviews)
router.put('/interviews/update', verifyAuth, updateInterviews)

module.exports = router
