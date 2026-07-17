const router = require('express').Router()

const {
    createJobOpening,
    updateJobOpening,
    deleteJobOpening,
    getOnJobOpening,
    findJobOpening
} = require('../controllers/jobOpening')
const { verifyAuth } = require('../middleware/auth')

router.post('/jobOpening/create', verifyAuth, createJobOpening)
router.get('/jobOpening/find',  findJobOpening)
router.put('/jobOpening/:id', verifyAuth, updateJobOpening)
router.delete('/jobOpening/:id', verifyAuth, deleteJobOpening)
router.post('/jobOpenings', verifyAuth, getOnJobOpening)

module.exports = router
