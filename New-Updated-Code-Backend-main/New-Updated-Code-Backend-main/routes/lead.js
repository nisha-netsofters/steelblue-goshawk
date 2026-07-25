const router = require('express').Router()
const { verifyAuth } = require('../middleware/auth')


const { createLead, getLead, updateLead, deleteLead } = require('../controllers/lead')
router.post('/lead/create', verifyAuth, createLead)
router.post('/lead', verifyAuth, getLead)
router.put('/lead/update/:id', verifyAuth, updateLead)
router.delete('/lead/delete/:id', verifyAuth, deleteLead)

module.exports = router
