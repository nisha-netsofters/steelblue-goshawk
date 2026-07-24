/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex.schema.createTable('jobOpening', (table) => {
        table.uuid('id', { primaryKey: true })
        table.uuid('userId').nullable()
        table.uuid('jobCategoryId').nullable()
        table.uuid('industriesId').nullable()
        table.string('numberOfVacancy')
        table.string('jobStartTime').nullable()
        table.string('jobEndTime').nullable()
        table.string('sunday').checkIn(['on', 'off']);
        table.string('minExperienceYears').nullable()
        table.string('gender').nullable()
        table.string('workType').nullable()
        table.string('qualification').nullable()
        table.string('field').nullable()
        table.string('course').nullable()
        table.string('designation').nullable()
        table.integer('salaryRangeStart').nullable().defaultTo(0)
        table.integer('salaryRangeEnd').nullable().defaultTo(0)
        table.string('negotiable').checkIn(['yes', 'no']);
        table.string('jobLocation').nullable()
        table.text('basicSkill').nullable()
        table.text('keyRole').nullable()
        table.integer('workingDays').nullable().defaultTo(5)
        table.integer('PL_SL_CL').nullable().defaultTo(0)
        table.string('healthPolicy').nullable()
        table.integer('pf_esic').nullable().defaultTo(0)
        table.string('other').nullable()
        table.timestamps(true, true);
    })
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {

};
