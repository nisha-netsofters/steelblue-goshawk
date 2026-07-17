/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex.schema.createTable('professional', table => {
        table.uuid("id", { primaryKey: true })
        table.uuid('candidateId').nullable()
        table.uuid('jobCategoryId').nullable()
        table.uuid('industriesId').nullable()
        table.string('course')
        table.string('field')
        table.string('designation')
        table.string('experienceInyear')
        table.string('expectedsalary')
        table.text('skill')
        table.string('noticePeriod')
        table.string('highestQualification')
        table.string('currentlyWorking')
        table.string('currentSalary')
        table.string('currentEmployer')
        table.timestamps(true, true);
    })
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex.schema.dropTable('professional')
};
