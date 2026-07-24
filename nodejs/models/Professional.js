const { Model } = require('objection')
const knex = require('../db/knex')
const { v4: uuidv4 } = require('uuid')
const Candidate = require('./Candidate')

Model.knex(knex)

class Professional extends Model {
  static get tableName() {
    return 'professional'
  }

  static get relationMappings() {
    const Industries = require('./Industries')
    const JobCategory = require('./JobCategory')
    return {
      candidate: {
        relation: Model.BelongsToOneRelation,
        modelClass: Candidate,
        join: {
          from: 'professional.candidateId',
          to: 'candidates.id',
        },
      },
      // industries: {
      //   relation: Model.BelongsToOneRelation,
      //   modelClass: Industries,
      //   join: {
      //     from: 'professional.industriesId',
      //     to: 'industries.id',
      //   },
      // },
      jobCategory: {
        relation: Model.BelongsToOneRelation,
        modelClass: JobCategory,
        join: {
          from: 'professional.jobCategoryId',
          to: 'jobCategory.id',
        },
      },
    }
  }
  $beforeInsert(context) {
    this.id = uuidv4()
  }
}

module.exports = Professional
