/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex.schema.createTable('jobCategory', table => {
        table.uuid("id", { primaryKey: true })
        table.string('jobCategory').unique()
        table.integer('isdeleted').defaultTo(0)
        table.string('comments')
        table.timestamps(true, true);
    })
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex.schema.dropTable('jobCategory')
};
