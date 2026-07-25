/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex.schema.createTable('experience', table => {
        table.uuid("id", { primaryKey: true })
        table.uuid('candidateId')
        table.string('occupation')
        table.string('workduration');
        table.string('summary')
        table.string('companyName')
        table.string('companyMobile')
        table.string('companyAddress')
        table.string('companyLink')
        table.timestamps(true, true);
    })
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex.schema.dropTable('experience')
};
