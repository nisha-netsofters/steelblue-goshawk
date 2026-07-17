const { Model } = require('objection')
const knex = require('../db/knex')
const { v4: uuidv4 } = require('uuid')
const Clients = require('./Clients')

class ClientFeedBack extends Model {
  static get tableName() {
    return 'clientFeedback'
  }
  static get relationMappings() {
    const OnBoarding = require("./onBoarding")
    return {
      onBoarding: {
        relation: Model.BelongsToOneRelation,
        modelClass: OnBoarding,
        join: {
          from: 'clientFeedback.onBoardingId',
          to: 'onBoarding.id',
        },
      },
      clients: {
        relation: Model.BelongsToOneRelation,
        modelClass: Clients,
        join: {
          from: 'clientFeedback.onBoardingId',
          to: 'clients.id',
        },
      },
    }
  }
  $beforeInsert(context) {
    this.id = uuidv4()
  }
}


module.exports = ClientFeedBack