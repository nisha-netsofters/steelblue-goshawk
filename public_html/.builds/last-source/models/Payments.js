const knex = require("../db/knex");
const { v4: uuidv4 } = require("uuid");
const { Model } = require("objection");

Model.knex(knex);

class Payments extends Model {
  static get tableName() {
    return "payments";
  }
  static get relationMappings() {}
  $beforeInsert(context) {
    this.id = uuidv4();
  }
}

module.exports = Payments;
