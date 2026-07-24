/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.createTable('clientFeedback', (table) => {
    table.uuid('id', { primaryKey: true })
    table.uuid("onBoardingId")
    table.text("feedback")
    table.integer('isdeleted').defaultTo(0)
    table.timestamps(true, true)
  })
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {}
