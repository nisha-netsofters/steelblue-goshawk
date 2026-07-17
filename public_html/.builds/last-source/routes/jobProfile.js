const router = require('express').Router()

const {
  createJobProfile,
  updateJobProfile,
  getJobProfile,
  deleteJobProfile,
} = require('../controllers/jobProfile')
const { verifyAuth } = require('../middleware/auth')

router.post('/jobProfile/create', verifyAuth, createJobProfile)
router.put('/jobProfile/update/:id', verifyAuth, updateJobProfile)
router.delete('/jobProfile/delete/:id', verifyAuth, deleteJobProfile)
router.post('/jobProfiles', verifyAuth, getJobProfile)

module.exports = router
