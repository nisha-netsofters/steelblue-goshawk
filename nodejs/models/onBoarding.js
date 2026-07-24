const { Model } = require('objection')
const knex = require('../db/knex')
const { v4: uuidv4 } = require('uuid')
Model.knex(knex)

class OnBoarding extends Model {
    static get tableName() {
        return 'onBoarding'
    }

    static get relationMappings() {
        const Industries = require('./Industries')
        const ClientFeedBack = require('./ClientFeedBack')
        const JobCategory = require("./JobCategory")
        const User = require("./User")
        const Interviews = require("./Interviews")
        return {
            jobCategory: {
                relation: Model.BelongsToOneRelation,
                modelClass: JobCategory,
                join: {
                    from: 'onBoarding.jobCategoryId',
                    to: 'jobCategory.id',
                },
            },
            users: {
                relation: Model.BelongsToOneRelation,
                modelClass: User,
                join: {
                    from: 'onBoarding.userId',
                    to: 'users.id',
                },
            },
            interviews: {
                relation: Model.HasManyRelation,
                modelClass: Interviews,
                join: {
                    from: "onBoarding.id",
                    to: 'interviews.onBoardingId'
                }
            },
            clientFeedback: {
                relation: Model.HasOneRelation,
                modelClass: ClientFeedBack,
                join: {
                    from: "onBoarding.id",
                    to: 'clientFeedback.onBoardingId'
                }
            },
            industries: {
                relation: Model.BelongsToOneRelation,
                modelClass: Industries,
                join: {
                    from: 'onBoarding.industriesId',
                    to: 'industries.id',
                },
            },

        }
    }

    $beforeInsert(context) {
        this.id = uuidv4()
    }
}

module.exports = OnBoarding