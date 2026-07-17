const { Model } = require("objection");
const knex = require("../db/knex");
const { v4: uuidv4 } = require("uuid");

Model.knex(knex);

class InterviewRequest extends Model {
  static get tableName() {
    return "interview_request";
  }
  static get relationMappings() {}
  $beforeInsert(context) {
    this.id = uuidv4();
  }
}

module.exports = InterviewRequest;
