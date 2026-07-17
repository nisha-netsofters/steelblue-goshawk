/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex.schema.createTable('clients', table => {
        table.uuid("id", { primaryKey: true })
        table.uuid('userId').nullable()
        table.uuid('industriesId').nullable()
        table.string('companyName')
        table.string('companyowner')
        table.string('mobile').unique()
        table.string('email').unique()
        table.string('website')
        table.string('street')
        table.string('city')
        table.string('zip')
        table.string('state')
        table.string('action').defaultTo("pending").checkIn(["declined", "approved", "pending"])
        table.timestamps(true, true);
    })
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex.schema.dropTable('company')
};
