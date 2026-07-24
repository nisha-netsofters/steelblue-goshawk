const router = require('express').Router()

const {
  createJobCategory,
  getjobCategories,
  updateJobCategory,
  deleteJobCategory,
  getAllJobCategories,

} = require('../controllers/jobCategory')
const { verifyAuth } = require('../middleware/auth')

router.post('/jobCategories', verifyAuth, getjobCategories)
router.post('/jobCategory/all', getAllJobCategories)
router.post('/jobCategory/create', verifyAuth, createJobCategory)
router.put('/jobCategory/update/:id', verifyAuth, updateJobCategory)
router.delete('/jobCategory/delete/:id', verifyAuth, deleteJobCategory)


module.exports = router