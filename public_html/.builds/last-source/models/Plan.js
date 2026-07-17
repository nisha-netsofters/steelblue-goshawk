const { Model } = require("objection");
const knex = require("../db/knex");
const { v4: uuidv4 } = require("uuid");

Model.knex(knex);

class Plans extends Model {
  static get tableName() {
    return "plans";
  }
  static get relationMappings() {
    const PlanFeatures = require("./PlanFeatures");
    return {
      planFeature: {
        relation: Model.BelongsToOneRelation,
        modelClass: PlanFeatures,
        join: {
          from: "plan_features.id",
          to: "plans.plan_feature_id",
        },
      },
    };
  }
  $beforeInsert(context) {
    this.id = uuidv4();
  }
}

module.exports = Plans;
