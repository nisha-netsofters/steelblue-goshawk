/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
    return knex.schema.createTable('jobProfile', table => {
        table.uuid("id", { primaryKey: true })
        table.uuid('companyId')
        table.uuid('userId')
        table.string('name')
        table.string('email')
        table.string('mobile')
        table.string('website')
        table.string('designation')
        table.string('experience')
        table.integer('noOfVacancy')
        table.json("jobTime")
        table.string('sunday').checkIn(['on', 'off']);
        table.string('freshersAllowed').checkIn(['yes', 'no']);
        table.string('work').checkIn(['inhouse', 'field']);
        table.string('negotiable').checkIn(['yes', 'no']);
        table.string('joiningStatus').checkIn(['joined', 'trial', "left", "breakOut", "onHold"]);
        table.string('gender')
        table.string('qualification')
        table.json('salaryRange')
        table.string('jobLocation')
        table.string('skill')
        table.string('keyRole')
        table.string('workingDays')
        table.string('leave')
        table.string('healthPolicy')
        table.string('pf')
        table.string('others')
        table.string('comments')
        table.integer('isdeleted').defaultTo(0)
        table.timestamps(true, true);
    })
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  
};
