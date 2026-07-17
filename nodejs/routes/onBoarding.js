const router = require('express').Router()

const {
    createOnBoarding,
    deleteOnBoarding,
    getOnBoarding,
    updateOnBoarding
} = require('../controllers/onBoarding')
const { verifyAuth } = require('../middleware/auth')

router.post('/onBoarding', verifyAuth, createOnBoarding)
router.put('/onBoarding/:id', verifyAuth, updateOnBoarding)
router.delete('/onBoarding/:id', verifyAuth, deleteOnBoarding)
router.post('/onBoardings', verifyAuth, getOnBoarding)

module.exports = router
