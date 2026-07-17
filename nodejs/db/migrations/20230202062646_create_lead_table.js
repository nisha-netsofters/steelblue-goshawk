/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.createTable('lead', (table) => {
    table.uuid('id', { primaryKey: true })
    table.string('companyName')
    table.string('contactPersonName')
    table.string('contactNumber')
    table.string('email')
    table.string('address')
    table.string('city')
    table.string('industries')
    table.string('profile')
    table.string('plan').checkIn(['enterprise', 'standard', 'professional'])
    table.string('replacementDays')
    table.string('annualCTC')
    table.string('term')
    table.string('deposit')
    table.string('mode')
    table.string('hr')
    table.string('requirements')
    table.string('starRating')
    table.string('remark1')
    table.string('remark2')
    table.string('remark3')
    table.integer('isdeleted').defaultTo(0)
    table.timestamps(true, true)
    
  })
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {}
