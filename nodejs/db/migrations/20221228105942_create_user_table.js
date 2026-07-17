/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex.schema.createTable('users', table => {
        table.uuid("id").primary();
        table.string('name');
        table.string('email').unique();
        table.string('password');
        table.string('mobile').checkLength("<=", 10).unique();
        table.text('address');
        table.text('image');
        table.string('comments')
        table.uuid('roleId').nullable()
        table.timestamps(true, true);
    })
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex.schema.dropTable('users')
};
