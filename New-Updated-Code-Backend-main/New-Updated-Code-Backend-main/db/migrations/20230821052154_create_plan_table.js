/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.createTable("plans", (table) => {
    table.uuid("id").primary();
    table.uuid("plan_feature_id").notNullable();
    table.string("planName").notNullable();
    table.string("price");
    table.timestamps(true, true);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {};
