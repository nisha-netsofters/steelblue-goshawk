const {Model} = require("objection");
const {knex} = require("../db/knex")
const {v4: uuidv4} = require('uuid');
const Candidate = require("./Candidate");

Model.knex(knex)

class Experience extends Model {
    static get tableName() {
        return 'experience'
    }
    static get relationMappings(){
        return {
            candidate:{
                relation: Model.BelongsToOneRelation,
                modelClass: Candidate,
                join: {
                    from: 'experience.candidateId',
                    to: 'candidates.id'
                }
            }
        }
    }
       $beforeInsert(context) {
        this.id = uuidv4();
    }
}

module.exports = Experience;