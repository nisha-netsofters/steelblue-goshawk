/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.createTable("subscriptions", (table) => {
    table.uuid("id", { primaryKey: true });
    table.uuid("planId").notNullable();
    table.uuid("userId").nullable();
    table.uuid("payment_id").nullable().defaultTo(null);
    table.boolean("active_plan");
    table.string("timeDuration");
    table.integer("resume_download_count").defaultTo(0);
    table.integer("interview_request_count").defaultTo(0);
    table.timestamps(true, true);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {};
