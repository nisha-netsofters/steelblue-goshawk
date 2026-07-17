const { Model } = require('objection')
const knex = require('../db/knex')
const { v4: uuidv4 } = require('uuid')

class Lead extends Model {
  static get tableName() {
    return 'lead'
  }

  $beforeInsert(context) {
    this.id = uuidv4()
  }
}


module.exports = Lead