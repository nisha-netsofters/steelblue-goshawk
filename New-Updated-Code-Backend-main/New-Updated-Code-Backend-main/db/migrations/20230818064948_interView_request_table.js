/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.createTable("interview_request", (table) => {
    table.uuid("id", { primaryKey: true });
    table.uuid("userId").nullable();
    table.uuid("candidateId").nullable();
    table.uuid("clientId").nullable();
    table.timestamps(true, true);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {};
