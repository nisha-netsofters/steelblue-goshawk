const { Model } = require('objection')
const knex = require('../db/knex')
const { v4: uuidv4 } = require('uuid')
Model.knex(knex)

class JobProfile extends Model {
    static get tableName() {
        return 'jobProfile'
    }

    static get relationMappings() {
        const User = require('./User')
        return {
            users: {
                relation: Model.BelongsToOneRelation,
                modelClass: User,
                join: {
                    from: 'jobProfile.userId',
                    to: 'users.id'
                }
            },

        }
    }

    $beforeInsert(context) {
        this.id = uuidv4()
    }
}

module.exports = JobProfile