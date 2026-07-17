const { Model } = require('objection')
const knex = require('../db/knex')
const { v4: uuidv4 } = require('uuid')
Model.knex(knex)

class JobOpening extends Model {
    static get tableName() {
        return 'jobOpening'
    }

    static get relationMappings() {
        const JobCategory = require("./JobCategory")
        const Industries = require('./Industries')
        return {
            jobCategory: {
                relation: Model.BelongsToOneRelation,
                modelClass: JobCategory,
                join: {
                    from: 'jobOpening.jobCategoryId',
                    to: 'jobCategory.id',
                },
            },
            industries: {
                relation: Model.BelongsToOneRelation,
                modelClass: Industries,
                join: {
                    from: 'jobOpening.industriesId',
                    to: 'industries.id',
                },
            },

        }
    }

    $beforeInsert(context) {
        this.id = uuidv4()
    }
}

module.exports = JobOpening