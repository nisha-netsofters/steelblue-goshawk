/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex.schema.createTable('candidates', table => {
        table.uuid("id", { primaryKey: true })
        table.uuid('jobOpeningId').nullable();
        table.uuid('userId').nullable();
        table.uuid("interviewerId").nullable()
        table.string('firstname');
        table.string('lastname')
        table.string('mobile').unique()
        table.string('email').unique();
        table.string('street')
        table.string('city')
        table.string('state')
        // table.string('country')
        table.string('zip')
        table.string('alternateMobile')
        table.string('status').checkIn(["new", "view"]).defaultTo("new")
        table.string('interviewStatus').defaultTo("available")
        table.string('comments')
        table.string('gender')
        table.text('image')
        table.text('resume')
        table.string('interviewStatusUpdate')
        table.timestamps(true, true);
    })
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex.schema.dropTable('candidates')
};
