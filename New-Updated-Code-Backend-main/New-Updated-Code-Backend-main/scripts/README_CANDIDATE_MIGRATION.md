# Candidate User Migration Script

This script creates user accounts for all existing candidates in the database, allowing them to log in using the existing authentication system.

## What This Script Does

1. **Creates "Candidate" Role**: Creates a new "Candidate" role in the role collection if it doesn't exist
2. **Creates User Accounts**: For each candidate:
   - Generates a secure random password (10 characters, alphanumeric)
   - Hashes the password using bcrypt
   - Creates a user entry in the Users collection
   - Links the candidate to the user via `candidate.userId`
3. **Sends Email Notifications**: Sends login credentials to each candidate via email

## Prerequisites

- MongoDB connection configured in `.env` file (`DATABASE_URL`)
- Email service configured in `.env` file (`REACT_APP_USER`, `REACT_APP_PASS`)
- All required npm packages installed (`bcryptjs`, `mongoose`, etc.)

## How to Run

### Option 1: Using npm script (Recommended)
```bash
npm run migrate:candidates
```

### Option 2: Direct node command
```bash
node scripts/createCandidateUsers.js
```

## What Happens During Migration

The script will:
- ✅ Skip candidates without email addresses
- ✅ Skip candidates that already have user accounts (by email)
- ✅ Skip candidates already linked to existing users
- ✅ Create new users for candidates without accounts
- ✅ Send email notifications with login credentials
- ✅ Provide a detailed summary report

## Output Example

```
✅ Database connected successfully
✅ 'Candidate' role already exists
📊 Found 150 candidates to process
✅ Created user and sent email 1/150: candidate1@example.com
✅ Created user and sent email 2/150: candidate2@example.com
...

==================================================
📊 MIGRATION SUMMARY
==================================================
✅ Successfully created: 145 users
⏭️  Skipped: 5 candidates
❌ Errors: 0 candidates
==================================================
```

## Email Template

Candidates will receive an email with:
- Their login email address
- Their auto-generated password
- Instructions on how to log in
- Security recommendation to change password

## Important Notes

1. **Password Security**: All passwords are auto-generated and hashed using bcrypt before storage
2. **Idempotent**: The script can be run multiple times safely - it will skip candidates that already have user accounts
3. **Error Handling**: The script continues processing even if individual candidates fail, and provides a detailed error report
4. **Email Failures**: If email sending fails for a candidate, the user account is still created (you can resend emails manually if needed)

## Troubleshooting

### Script fails to connect to database
- Check your `.env` file has correct `DATABASE_URL`
- Ensure MongoDB is running and accessible

### Email sending fails
- Verify email credentials in `.env` (`REACT_APP_USER`, `REACT_APP_PASS`)
- Check email service provider settings
- User accounts are still created even if emails fail

### Some candidates skipped
- This is normal if:
  - Candidate has no email address
  - Candidate already has a user account
  - Candidate is already linked to a user

## After Migration

After running the migration:
1. Candidates can log in using their email and the password sent to them
2. They should change their password on first login (recommended)
3. All existing login functionality will work for candidates automatically
4. No changes needed to existing authentication code

## Rollback

If you need to remove candidate users:
- You can manually delete users with role "Candidate" from the Users collection
- Update candidates to remove `userId` references
- The script is designed to be safe and non-destructive



