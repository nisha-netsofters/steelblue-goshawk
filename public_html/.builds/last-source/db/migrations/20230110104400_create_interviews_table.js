/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.createTable('interviews', (table) => {
    table.uuid('id', { primaryKey: true })
    table.uuid('candidateId').nullable()
    table.uuid('onBoardingId').nullable()
    table.uuid('userId').nullable()
    table.string('date').nullable()
    table.string('joiningDate').nullable()
    table.string('startingSalary').nullable()
    table.string('time').nullable()
    table.string('link').nullable()
    table.string('interviewType').checkIn(['personal', "virtual", 'telephonic'])
    table.string('comments').nullable()
    table.integer('isdeleted').defaultTo(0)
    table.timestamps(true, true);
  })
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) { }
