const { Model } = require('objection');
const knex = require('../db/knex')
const { v4: uuidv4 } = require('uuid');
const Candidate = require('./Candidate');

Model.knex(knex)

class Education extends Model {
    static get tableName() {
        return 'education';
    }

    static get relationMappings(){
        return{
            candidate:{
                relation: Model.BelongsToOneRelation,
                modelClass: Candidate,
                join: {
                    from: 'education.candidateId',
                    to: 'candidates.id'
                }
            }
        }
    }

    $beforeInsert(context) {
        this.id = uuidv4();
    }
}

module.exports = Education;