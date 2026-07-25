require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const Users = require("../models-v2/users_Mongoose");

/**
 * One-time migration script to hash existing plain-text passwords
 * for Users collection and set isBcrypt = true.
 *
 * This is safe to run multiple times. It:
 * - Only processes users where isBcrypt is not true
 * - Skips users without a password
 * - Detects already-bcrypt-like passwords and just flips isBcrypt
 */

async function hashExistingUserPasswords() {
  try {
    if (!process.env.DATABASE_URL) {
      console.error("❌ DATABASE_URL is not configured in .env");
      process.exit(1);
    }

    await mongoose.connect(process.env.DATABASE_URL);
    console.log("✅ Database connected successfully");

    // Find users that are not yet marked as bcrypt
    const users = await Users.find({
      $or: [{ isBcrypt: { $ne: true } }, { isBcrypt: { $exists: false } }],
    });

    console.log(`📊 Found ${users.length} users potentially needing migration`);

    let updatedCount = 0;
    let skippedNoPassword = 0;
    let markedAlreadyBcrypt = 0;
    let errorCount = 0;

    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      const logPrefix = `User ${i + 1}/${users.length} (id=${user.id}, email=${
        user.email
      })`;

      try {
        const currentPassword = user.password;

        if (!currentPassword || typeof currentPassword !== "string") {
          skippedNoPassword++;
          console.log(`${logPrefix} ⏭️  Skipped (no password)`);
          continue;
        }

        // If password already looks like a bcrypt hash, don't re-hash it
        const looksLikeBcrypt =
          currentPassword.startsWith("$2a$") ||
          currentPassword.startsWith("$2b$") ||
          currentPassword.startsWith("$2y$");

        if (looksLikeBcrypt && currentPassword.length >= 50) {
          user.isBcrypt = true;
          await user.save();
          markedAlreadyBcrypt++;
          console.log(`${logPrefix} ✅ Marked as already bcrypt`);
          continue;
        }

        // Hash existing plain-text password
        const hashed = await bcrypt.hash(currentPassword, 10);
        user.password = hashed;
        user.isBcrypt = true;
        await user.save();

        updatedCount++;
        console.log(`${logPrefix} ✅ Password hashed and updated`);
      } catch (err) {
        errorCount++;
        console.error(`${logPrefix} ❌ Error:`, err.message || err);
      }
    }

    console.log("\n" + "=".repeat(50));
    console.log("📊 USER PASSWORD MIGRATION SUMMARY");
    console.log("=".repeat(50));
    console.log(`✅ Updated (hashed): ${updatedCount}`);
    console.log(`✅ Marked already bcrypt: ${markedAlreadyBcrypt}`);
    console.log(`⏭️  Skipped (no password): ${skippedNoPassword}`);
    console.log(`❌ Errors: ${errorCount}`);
    console.log("=".repeat(50));

    await mongoose.connection.close();
    console.log("✅ Migration completed. Database connection closed.");
  } catch (error) {
    console.error("❌ Migration failed:", error);
    try {
      await mongoose.connection.close();
    } catch (e) {
      // ignore
    }
    process.exit(1);
  }
}

if (require.main === module) {
  hashExistingUserPasswords()
    .then(() => {
      console.log("✅ Script execution completed");
      process.exit(0);
    })
    .catch((error) => {
      console.error("❌ Script execution failed:", error);
      process.exit(1);
    });
}

module.exports = { hashExistingUserPasswords };


