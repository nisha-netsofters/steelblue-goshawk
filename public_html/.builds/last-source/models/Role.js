const { Model } = require('objection');
const knex = require('../db/knex')
const { v4: uuidv4 } = require('uuid');

Model.knex(knex)

class Role extends Model {
    static get tableName() {
        return 'role';
    }

    static get relationMappings() {
        const User = require('./User');
        return {
            users: {
                relation: Model.HasManyRelation,
                modelClass: User,
                join: {
                    from: 'role.id',
                    to: 'users.roleId'
                }
            }
        }
    }

    $beforeInsert(context) {
        this.id = uuidv4();
    }
}

module.exports = Role;