const { Model } = require('objection')
const knex = require('../db/knex')
const { v4: uuidv4 } = require('uuid')
const { Client } = require('pg')
Model.knex(knex)

class Industries extends Model {
    static get tableName() {
        return 'industries'
    }
    static get relationMappings() {
        const Industries_Relation = require('./Industries_Relation')
        const JobOpening = require('./JobOpening')
        const OnBoarding = require('./onBoarding')
        return {
            industries_relation: {
                relation: Model.BelongsToOneRelation,
                modelClass: Industries_Relation,
                join: {
                    from: 'industries.id',
                    to: 'industries_relation.industriesId',
                },
            },
            jobOpening: {
                relation: Model.HasManyRelation,
                modelClass: JobOpening,
                join: {
                    from: 'industries.id',
                    to: 'jobOpening.industriesId',
                },
            },
            client: {
                relation: Model.HasManyRelation,
                modelClass: Client,
                join: {
                    from: 'industries.id',
                    to: 'client.industriesId',
                },
            },
            onBoarding: {
                relation: Model.HasManyRelation,
                modelClass: OnBoarding,
                join: {
                    from: 'industries.id',
                    to: 'onBoarding.industriesId',
                },
            },
        }
    }

    $beforeInsert(context) {
        this.id = uuidv4()
    }
}


module.exports = Industries;