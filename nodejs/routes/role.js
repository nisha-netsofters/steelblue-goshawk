const { getRoles, getRoleById } = require('../controllers/role')

const router = require('express').Router()

router.get('/roles', getRoles)
router.get('/role/:id', getRoleById)

module.exports = router
