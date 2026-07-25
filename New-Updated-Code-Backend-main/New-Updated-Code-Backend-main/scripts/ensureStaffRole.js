const mongoose = require("mongoose");
const Role = require("../models-v2/role_Mongoose");
require("dotenv").config();

/**
 * Ensures a dedicated "Staff" role exists in MongoDB.
 * Safe to run multiple times (upsert by name).
 */
async function ensureStaffRole() {
  const uri = process.env.DATABASE_URL || process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("DATABASE_URL / MONGODB_URI is not set");
  }

  await mongoose.connect(uri);
  let role = await Role.findOne({ name: "Staff" });
  if (role) {
    console.log(`Staff role already exists (id=${role.id})`);
  } else {
    const id = new mongoose.Types.ObjectId().toString();
    role = await Role.create({ id, name: "Staff" });
    console.log(`Created Staff role (id=${role.id})`);
  }
  await mongoose.disconnect();
  return role;
}

if (require.main === module) {
  ensureStaffRole()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { ensureStaffRole };
