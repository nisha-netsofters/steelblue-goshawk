const { Model } = require('objection')
const knex = require('../db/knex')
const { v4: uuidv4 } = require('uuid')
const JobOpening = require('./JobOpening')
Model.knex(knex)

class JobCategory extends Model {
  static get tableName() {
    return 'jobCategory'

  }
  static get relationMappings() {
    const JobCategory_Relation = require('./JobCategory_Relation')
    const Professional = require("./Professional")
    return {
      professional: {
        relation: Model.HasManyRelation,
        modelClass: Professional,
        join: {
          from: 'jobCategory.id',
          to: 'professional.jobCategoryId',
        },
      },
      jobCategory_relation: {
        relation: Model.BelongsToOneRelation,
        modelClass: JobCategory_Relation,
        join: {
          from: 'jobCategory.id',
          to: 'jobCategory_relation.jobCategoryId',
        },
      },
      jobOpening: {
        relation: Model.HasManyRelation,
        modelClass: JobOpening,
        join: {
          from: 'jobCategory.id',
          to: 'jobOpening.jobCategoryId',
        },
      },

    }
  }

  $beforeInsert(context) {
    this.id = uuidv4()
  }
}


module.exports = JobCategory;