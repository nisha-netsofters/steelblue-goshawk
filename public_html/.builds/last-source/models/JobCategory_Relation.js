const { Model } = require('objection')
const knex = require('../db/knex')
const { v4: uuidv4 } = require('uuid')

Model.knex(knex)

class JobCategory_Relation extends Model {
    static get tableName() {
        return 'jobCategory_relation'
    }
    //relationship
    static get relationMappings() {
        const Clients = require('./Clients')
        const Candidate = require('./Candidate')
        const jobCategory = require('./JobCategory')

        return {
            clients: {
                relation: Model.BelongsToOneRelation,
                modelClass: Clients,
                join: {
                    from: 'jobCategory_relation.c_id',
                    to: 'clients.id'
                }
            },
            jobCategory: {
                relation: Model.HasOneRelation,
                modelClass: jobCategory,
                join: {
                    from: 'jobCategory_relation.jobCategoryId',
                    to: 'jobCategory.id'
                }
            }
        }
    }

    $beforeInsert(context) {
        this.id = uuidv4()
    }
}

module.exports = JobCategory_Relation
