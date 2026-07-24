const { Model } = require("objection");
const knex = require("../db/knex");
const { v4: uuidV4 } = require("uuid");

Model.knex(knex);

class PlanFeatures extends Model {
  static get tableName() {
    return "plan_features";
  }
  static get relationMappings() {}
  $beforeInsert(context) {
    this.id = uuidV4();
  }
}

module.exports = PlanFeatures;
