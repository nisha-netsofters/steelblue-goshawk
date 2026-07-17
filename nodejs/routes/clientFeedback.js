const router = require('express').Router()
const { verifyAuth } = require('../middleware/auth')

const {
  createClientFeedback,
  getClientFeedback,
  updateClientFeedback,
  deleteClientFeedback,
} = require('../controllers/clientFeedback')
router.post('/clientfeedback/create', verifyAuth, createClientFeedback)
router.post('/clientfeedback', verifyAuth, getClientFeedback)
router.put('/clientfeedback/update/:id', verifyAuth, updateClientFeedback)
router.delete('/clientfeedback/delete/:id', verifyAuth, deleteClientFeedback)

module.exports = router
