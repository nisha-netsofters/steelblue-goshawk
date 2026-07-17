const { Model } = require("objection");
const knex = require("../db/knex");
const { v4: uuidv4 } = require("uuid");

Model.knex(knex);

class Subscriptions extends Model {
  static get tableName() {
    return "subscriptions";
  }
  static get relationMappings() {
    const Plans = require("./Plan");
    const User = require("./User");
    return {
      plan: {
        relation: Model.HasOneRelation,
        modelClass: Plans,
        join: {
          from: "subscriptions.planId",
          to: "plans.id",
        },
      },
      user: {
        relation: Model.BelongsToOneRelation,
        modelClass: User,
        join: {
          from: "subscriptions.id",
          to: "users.subscriptionId",
        },
      },
    };
  }

  $beforeInsert(context) {
    this.id = uuidv4();
  }
}

module.exports = Subscriptions;
