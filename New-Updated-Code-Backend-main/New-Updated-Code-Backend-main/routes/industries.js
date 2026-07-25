const router = require('express').Router()

const { createIndustries,  updateIndustries, deleteIndustries, getIndustries, getAllIndustries } = require('../controllers/industries')
const { verifyAuth } = require('../middleware/auth')

router.post('/industries', verifyAuth, getIndustries)
router.post('/industries/all', getAllIndustries)
router.post('/industries/create', verifyAuth, createIndustries)
router.put('/industries/update/:id', verifyAuth, updateIndustries)
router.delete('/industries/delete/:id', verifyAuth, deleteIndustries)


module.exports = router