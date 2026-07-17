/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.createTable("payments", (table) => {
    table.uuid("id", { primaryKey: true });
    table.uuid("userId").nullable();
    table.string("paymentId").nullable();
    table.string("entity").nullable();
    table.string("amount").nullable();
    table.string("status").nullable();
    table.string("currency").nullable();
    table.string("order_id").nullable();
    table.string("invoice_id").nullable();
    table.string("method").nullable();
    table.string("captured").nullable();
    table.string("card_id").nullable();
    table.string("email").nullable();
    table.string("contact").nullable();
    table.string("notes").nullable();
    table.string("fee").nullable();
    table.string("tax").nullable();
    table.string("error_code").nullable();
    table.string("error_description").nullable();
    table.string("error_source").nullable();
    table.string("error_step").nullable();
    table.string("error_reason").nullable();
    table.timestamps(true, true);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {};
