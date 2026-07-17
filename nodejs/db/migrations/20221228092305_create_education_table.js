/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex.schema.createTable('education', table => {
        table.uuid("id", { primaryKey: true })
        table.uuid('candidateId')
        table.string('institute')
        table.string('degree');
        table.string('department')
        table.string('english')
        table.string('eductionDuration')
        table.timestamps(true, true);
    })
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex.schema.dropTable('eduction')
};
