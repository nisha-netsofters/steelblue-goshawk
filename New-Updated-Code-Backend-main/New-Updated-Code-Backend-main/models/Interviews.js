const { Model } = require('objection')
const knex = require('../db/knex')
const { v4: uuidv4 } = require('uuid')

Model.knex(knex)

class Interviews extends Model {
  static get tableName() {
    return 'interviews'
  }

  static get relationMappings() {
    const Clients = require('./Clients')
    const Candidate = require('./Candidate')
    const OnBoarding = require('./onBoarding')
    const Users = require("./User")
    return {
      candidate: {
        relation: Model.BelongsToOneRelation,
        modelClass: Candidate,
        join: {
          from: 'interviews.candidateId',
          to: 'candidates.id',
        },
      },
      onBoarding: {
        relation: Model.BelongsToOneRelation,
        modelClass: OnBoarding,
        join: {
          from: 'interviews.onBoardingId',
          to: 'onBoarding.id',
        },
      },
      client: {
        relation: Model.BelongsToOneRelation,
        modelClass: Clients,
        join: {
          from: 'interviews.onBoardingId',
          to: 'clients.id',
        },
      },
      users: {
        relation: Model.BelongsToOneRelation,
        modelClass: Users,
        join: {
          from: 'interviews.userId',
          to: 'users.id',
        },
      },
    }
  }

  $beforeInsert(context) {
    this.id = uuidv4()
  }
}

module.exports = Interviews
