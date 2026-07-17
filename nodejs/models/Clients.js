const { Model } = require('objection')
const knex = require('../db/knex')
const { v4: uuidv4 } = require('uuid');
const Interviews = require('./Interviews');
const JobCategory = require('./JobCategory');
// const Interviews = require('./Interviews');
Model.knex(knex);

class Clients extends Model {
    static get tableName() {
        return 'clients';
    }
    static get relationMappings() {
        const JobCategory_Relation = require('./JobCategory_Relation');
        const Industries_Relation = require('./Industries_Relation');
        const ClientFeedBack = require('./ClientFeedBack');
        const Industries = require('./Industries');
        const User = require('./User');
        return {
            users: {
                relation: Model.BelongsToOneRelation,
                modelClass: User,
                join: {
                    from: 'clients.userId',
                    to: 'users.id'
                }
            },
            industries: {
                relation: Model.BelongsToOneRelation,
                modelClass: Industries,
                join: {
                    from: 'clients.industriesId',
                    to: 'industries.id'
                }
            },
            industries_relation: {
                relation: Model.HasManyRelation,
                modelClass: Industries_Relation,
                join: {
                    from: 'clients.id',
                    to: 'industries_relation.c_Id',
                },
            },
            jobCategories: {
                relation: Model.ManyToManyRelation,
                modelClass: JobCategory,
                join: {
                    from: 'clients.id',
                    through: {
                        from: 'jobCategory_relation.c_Id',
                        to: 'jobCategory_relation.jobCategoryId'
                    },
                    to: 'jobCategory.id'
                }

            },

            jobCategory_relation: {
                relation: Model.HasManyRelation,
                modelClass: JobCategory_Relation,
                join: {
                    from: 'clients.id',
                    to: 'jobCategory_relation.c_Id',
                },
            },
            clientFeedback: {
                relation: Model.HasOneRelation,
                modelClass: ClientFeedBack,
                join: {
                    from: "clients.id",
                    to: 'clientFeedback.onBoardingId'
                }
            },
            interviews: {
                relation: Model.HasManyRelation,
                modelClass: Interviews,
                join: {
                    from: "clients.id",
                    to: 'interviews.onBoardingId'
                }
            },
        }
    }
    $beforeInsert(context) {
        this.id = uuidv4()
    }
}

module.exports = Clients