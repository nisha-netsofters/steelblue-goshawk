const { Model } = require('objection')
const knex = require('../db/knex')
const { v4: uuidv4 } = require('uuid')
const Clients = require('./Clients')

Model.knex(knex)

class Industries_Relation extends Model {
    static get tableName() {
        return 'industries_relation'
    }
    //relationship
    static get relationMappings() {
        const Candidate = require('./Candidate')
        const Industries = require('./Industries')

        return {
            candidate: {
                relation: Model.BelongsToOneRelation,
                modelClass: Candidate,
                join: {
                    from: 'industries_relation.c_id',
                    to: 'candidates.id'
                }
            },
            clients: {
                relation: Model.BelongsToOneRelation,
                modelClass: Clients,
                join: {
                    from: 'industries_relation.c_id',
                    to: 'clients.id'
                }
            },

            industries: {
                relation: Model.HasOneRelation,
                modelClass: Industries,
                join: {
                    from: 'industries_relation.industriesId',
                    to: 'industries.id'
                }
            }
        }
    }

    $beforeInsert(context) {
        this.id = uuidv4()
    }
}

module.exports = Industries_Relation
