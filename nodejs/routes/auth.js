const express = require('express')
const { loginUser, refreshToken, VerifyToken } = require('../controllers/auth')
const { daysCountMiddleware } = require('../middleware/subsciptionDaysCount')

const router = express.Router()


router.post('/user/login', loginUser)
router.post('/user/check/token', VerifyToken)
router.post('/user/refresh_token', refreshToken)

module.exports = router