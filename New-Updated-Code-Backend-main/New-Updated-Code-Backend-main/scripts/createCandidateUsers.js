require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const { v4: uuidv4 } = require("uuid");
const Candidates = require("../models-v2/candidates_Mongoose");
const Users = require("../models-v2/users_Mongoose");
const Role = require("../models-v2/role_Mongoose");
const { enqueueEmailJob } = require("../mq/emailProducer");

// Generate random password
function generatePassword(length = 10) {
  const charset =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let password = "";
  for (let i = 0; i < length; i++) {
    password += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  return password;
}

// Main migration function
async function createCandidateUsers() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.DATABASE_URL);
    console.log("✅ Database connected successfully");

    // Step 1: Create or get "Candidate" role
    let candidateRole = await Role.findOne({ name: "Candidate" });
    if (!candidateRole) {
      const objectid = new mongoose.Types.ObjectId();
      candidateRole = await Role.create({
        _id: objectid,
        id: objectid,
        name: "Candidate",
      });
      console.log("✅ Created 'Candidate' role");
    } else {
      console.log("✅ 'Candidate' role already exists");
    }

    // Step 2: Get all candidates
    const candidates = await Candidates.find({});
    console.log(`📊 Found ${candidates.length} candidates to process`);

    let successCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    const errors = [];

    // Step 3: Process each candidate
    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i];
      try {
        // Skip if candidate doesn't have email
        if (!candidate.email) {
          console.log(
            `⏭️  Skipping candidate ${i + 1}/${candidates.length} - No email: ${candidate.firstname} ${candidate.lastname}`
          );
          skippedCount++;
          continue;
        }

        // Check if user already exists for this email
        const existingUser = await Users.findOne({ email: candidate.email });
        if (existingUser) {
          // Update candidate.userId if not already set
          if (!candidate.userId || candidate.userId !== existingUser.id) {
            await Candidates.updateOne(
              { id: candidate.id },
              { userId: existingUser.id }
            );
            console.log(
              `✅ Linked candidate ${i + 1}/${candidates.length} to existing user: ${candidate.email}`
            );
          } else {
            console.log(
              `⏭️  Skipping candidate ${i + 1}/${candidates.length} - User already exists and linked: ${candidate.email}`
            );
          }
          skippedCount++;
          continue;
        }

        // Check if candidate already has userId set (might be linked to a user that doesn't exist)
        if (candidate.userId) {
          const linkedUser = await Users.findOne({ id: candidate.userId });
          if (linkedUser) {
            console.log(
              `⏭️  Skipping candidate ${i + 1}/${candidates.length} - Already linked to user: ${candidate.email}`
            );
            skippedCount++;
            continue;
          }
        }

        // Generate password and hash it
        const plainPassword = generatePassword(10);
        const hashedPassword = await bcrypt.hash(plainPassword, 10);

        // Create user name from candidate name
        const userName = `${candidate.firstname || ""} ${candidate.lastname || ""}`.trim() || candidate.email;

        // Create user object
        const objectid = new mongoose.Types.ObjectId();
        const userData = {
          _id: objectid,
          id: objectid,
          email: candidate.email,
          password: hashedPassword,
          name: userName,
          mobile: candidate.mobile || "",
          roleId: candidateRole.id,
          agencyId: candidate.agencyId || null,
          isBcrypt: true,
        };

        // Create user
        const newUser = await Users.create(userData);

        // Update candidate with userId
        await Candidates.updateOne(
          { id: candidate.id },
          { userId: newUser.id }
        );
        console.log("plainPassword", plainPassword, candidate.email);

        // Enqueue email with credentials (handled by worker)
        await enqueueEmailJob("candidateLoginCredentials", {
          candidate: {
            firstname: candidate.firstname,
            lastname: candidate.lastname,
            email: candidate.email,
          },
          emailTo: candidate.email,
          password: plainPassword,
        });

        successCount++;
      } catch (error) {
        errorCount++;
        const errorMsg = `Error processing candidate ${i + 1}/${candidates.length} (${candidate.email}): ${error.message}`;
        console.error(`❌ ${errorMsg}`);
        errors.push({
          candidate: `${candidate.firstname} ${candidate.lastname}`,
          email: candidate.email,
          error: error.message,
        });
      }
    }

    // Summary
    console.log("\n" + "=".repeat(50));
    console.log("📊 MIGRATION SUMMARY");
    console.log("=".repeat(50));
    console.log(`✅ Successfully created: ${successCount} users`);
    console.log(`⏭️  Skipped: ${skippedCount} candidates`);
    console.log(`❌ Errors: ${errorCount} candidates`);
    console.log("=".repeat(50));

    if (errors.length > 0) {
      console.log("\n❌ ERRORS DETAILS:");
      errors.forEach((err, index) => {
        console.log(`${index + 1}. ${err.candidate} (${err.email}): ${err.error}`);
      });
    }

    // Close connection
    await mongoose.connection.close();
    console.log("\n✅ Migration completed. Database connection closed.");
  } catch (error) {
    console.error("❌ Migration failed:", error);
    await mongoose.connection.close();
    process.exit(1);
  }
}

// Run migration
if (require.main === module) {
  createCandidateUsers()
    .then(() => {
      console.log("✅ Script execution completed");
      process.exit(0);
    })
    .catch((error) => {
      console.error("❌ Script execution failed:", error);
      process.exit(1);
    });
}

module.exports = { createCandidateUsers };

