const { Model } = require("objection");
const knex = require("../db/knex");
const { v4: uuidv4 } = require("uuid");

Model.knex(knex);

class Candidate extends Model {
  static get tableName() {
    return "candidates";
  }
  //relationship
  static get relationMappings() {
    const InterviewRequest = require("./Interview_Request");
    const Industries = require("./Industries");
    const Saved_candidates = require("./Saved_candidates");
    const Industries_Relation = require("./Industries_Relation");
    const User = require("./User");
    const Professional = require("./Professional");
    const Education = require("./Education");
    const Experience = require("./Experience");
    const Interviews = require("./Interviews");
    return {
      professional: {
        relation: Model.HasOneRelation,
        modelClass: Professional,
        join: {
          from: "candidates.id",
          to: "professional.candidateId",
        },
      },
      education: {
        relation: Model.HasManyRelation,
        modelClass: Education,
        join: {
          from: "candidates.id",
          to: "education.candidateId",
        },
      },
      allIndustries: {
        relation: Model.ManyToManyRelation,
        modelClass: Industries,
        join: {
          from: "candidates.id",
          through: {
            from: "industries_relation.c_Id",
            to: "industries_relation.industriesId",
          },
          to: "industries.id",
        },
      },

      industries_relation: {
        relation: Model.HasManyRelation,
        modelClass: Industries_Relation,
        join: {
          from: "candidates.id",
          to: "industries_relation.c_Id",
        },
      },
      experience: {
        relation: Model.HasManyRelation,
        modelClass: Experience,
        join: {
          from: "candidates.id",
          to: "experience.candidateId",
        },
      },
      interviews: {
        relation: Model.HasOneRelation,
        modelClass: Interviews,
        join: {
          from: "candidates.id",
          to: "interviews.candidateId",
        },
      },
      saved_Candidates: {
        relation: Model.HasOneRelation,
        modelClass: Saved_candidates,
        join: {
          from: "candidates.id",
          to: "saved_candidates.candidateId",
        },
      },
      interview_request: {
        relation: Model.BelongsToOneRelation,
        modelClass: InterviewRequest,
        join: {
          from: "candidates.id",
          to: "interview_request.candidateId",
        },
      },
      users: {
        relation: Model.BelongsToOneRelation,
        modelClass: User,
        join: {
          from: "candidates.userId",
          to: "users.id",
        },
      },
    };
  }

  $beforeInsert(context) {
    this.id = uuidv4();
  }
}

module.exports = Candidate;
