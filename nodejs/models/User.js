const { Model } = require("objection");
const knex = require("../db/knex");
const { v4: uuidv4 } = require("uuid");
const Plans = require("./Plan");

Model.knex(knex);

class User extends Model {
  static get tableName() {
    return "users";
  }

  static get relationMappings() {
    const Clients = require("./Clients");
    const Candidate = require("./Candidate");
    const JobProfile = require("./JobProfile");
    const Role = require("./Role");
    const Interviews = require("./Interviews");
    const Subscriptions = require("./Subscriptions");
    return {
      role: {
        relation: Model.BelongsToOneRelation,
        modelClass: Role,
        join: {
          from: "users.roleId",
          to: "role.id",
        },
      },

      jobprofile: {
        relation: Model.HasManyRelation,
        modelClass: JobProfile,
        join: {
          from: "users.id",
          to: "jobProfile.userId",
        },
      },
      clients: {
        relation: Model.HasOneRelation,
        modelClass: Clients,
        join: {
          from: "users.id",
          to: "clients.userId",
        },
      },
      interviews: {
        relation: Model.HasManyRelation,
        modelClass: Interviews,
        join: {
          from: "users.id",
          to: "interviews.userId",
        },
      },
      candidate: {
        relation: Model.HasManyRelation,
        modelClass: Candidate,
        join: {
          from: "users.id",
          to: "candidates.userId",
        },
      },
      subscription: {
        relation: Model.HasOneRelation,
        modelClass: Subscriptions,
        join: {
          from: "users.subscriptionId",
          to: "subscriptions.id",
        },
      },
      plan: {
        relation: Model.HasOneRelation,
        modelClass: Plans,
        join: {
          from: "users.id",
          to: "plans.id",
        },
      },
    };
  }

  $beforeInsert(context) {
    this.id = uuidv4();
  }
}

module.exports = User;
