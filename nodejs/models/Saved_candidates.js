const { Model } = require("objection");
const knex = require("../db/knex");
const { v4: uuidv4 } = require("uuid");

Model.knex(knex);

class Saved_candidates extends Model {
  static get tableName() {
    return "saved_candidates";
  }
  static get relationMappings() {}
  $beforeInsert(context) {
    this.id = uuidv4();
  }
}

module.exports = Saved_candidates;
