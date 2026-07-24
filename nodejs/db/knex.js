require('dotenv').config();
var environment = process.env.NODE_ENV || 'development'
var config = require('../knexfile.js')

const knex = require('knex')(config[environment])

module.exports = knex;