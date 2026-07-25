/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.createTable("plan_features", (table) => {
    table.uuid("id", { primaryKey: true });
    table.string("validate_days").nullable();
    table.string("resume_download_count").defaultTo(5).notNullable();
    table.string("interview_count ").defaultTo(-1).notNullable();
    table.boolean("upgrade_profile_top").defaultTo(false).notNullable();
    table.boolean("export_candidate_lists").defaultTo(false).notNullable();
    table.boolean("mail_notification").defaultTo(false).notNullable();
    table.boolean("whatsapp_notification").defaultTo(false).notNullable();
    table.timestamps(true, true);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {};
