const { Model } = require('objection')
const knex = require('../db/knex')
const { v4: uuidv4 } = require('uuid')
Model.knex(knex)

class JobProfile extends Model {
    static get tableName() {
        return 'jobProfile'
    }
    $beforeInsert(context){
        this.id = uuidv4()
    }
}

module.exports = JobProfile