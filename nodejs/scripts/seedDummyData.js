/**
 * MongoDB dummy data seeder for local development & CRUD testing.
 * Idempotent — safe to re-run (skips records that already exist by email/id).
 *
 * Usage: npm run seed:dummy
 */
require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const Agency = require("../models-v2/agency_Mongooes");
const Role = require("../models-v2/role_Mongoose");
const Users = require("../models-v2/users_Mongoose");
const Clients = require("../models-v2/clients_Mongoose");
const Candidates = require("../models-v2/candidates_Mongoose");
const Industries = require("../models-v2/industries_Mongoose");
const JobCategory = require("../models-v2/jobCategory_Mongoose");
const JobOpening = require("../models-v2/jobOpening_Mongoose");
const Lead = require("../models-v2/lead_Mongoose");
const Interviews = require("../models-v2/interviews_Mongoose");
const JobApplication = require("../models-v2/jobApplication_Mongoose");
const ResumeEnquiry = require("../models-v2/resumeEnquiry_Mongoose");
const OnBoarding = require("../models-v2/onBoarding_Mongoose");

const SALT_ROUNDS = 10;
const AGENCY_SLUG = "uniqueworld";

const PASSWORDS = {
  admin: "Admin@123",
  staff: "Staff@123",
  client: "Client@123",
  candidate: "Candidate@123",
};

function makeId() {
  return new mongoose.Types.ObjectId().toString();
}

async function hashPassword(plain) {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

async function ensureRole(name) {
  let role = await Role.findOne({ name });
  if (!role) {
    const id = makeId();
    role = await Role.create({ _id: id, id, name });
    console.log(`  + Created role: ${name}`);
  }
  return role;
}

async function ensureUser({ email, password, name, mobile, roleId, agencyId }) {
  let user = await Users.findOne({ email, agencyId });
  if (user) return user;

  const id = makeId();
  const hashedPassword = await hashPassword(password);
  user = await Users.create({
    _id: id,
    id,
    email,
    password: hashedPassword,
    name,
    mobile,
    roleId,
    agencyId,
    city: "Surat",
    state: "Gujarat",
    cityId: "Surat",
    stateId: "GJ",
    isBcrypt: true,
  });
  console.log(`  + Created user: ${email} (${name})`);
  return user;
}

async function ensureIndustry(agencyId, category) {
  let industry = await Industries.findOne({ industryCategory: category, agencyId });
  if (!industry) {
    const id = makeId();
    industry = await Industries.create({
      _id: id,
      id,
      industryCategory: category,
      comments: `Seed industry — ${category}`,
      agencyId,
    });
    console.log(`  + Created industry: ${category}`);
  }
  return industry;
}

async function ensureJobCategory(agencyId, category) {
  let jobCat = await JobCategory.findOne({ jobCategory: category, agencyId });
  if (!jobCat) {
    const id = makeId();
    jobCat = await JobCategory.create({
      _id: id,
      id,
      jobCategory: category,
      isdeleted: 0,
      comments: `Seed job category — ${category}`,
      agencyId,
    });
    console.log(`  + Created job category: ${category}`);
  }
  return jobCat;
}

function buildIndustryRelation(industry, clientId) {
  const relId = makeId();
  return {
    id: relId,
    _id: relId,
    cId: clientId,
    createdAt: new Date(),
    industriesId: industry.id,
    industries: {
      _id: industry.id,
      id: industry.id,
      comments: industry.comments,
      createdAt: industry.createdAt || new Date(),
      industryCategory: industry.industryCategory,
      updatedAt: industry.updatedAt || new Date(),
      agencyId: industry.agencyId,
    },
  };
}

function buildJobCategoryRelation(jobCat, clientId) {
  const relId = makeId();
  return {
    jobCategoryId: jobCat.id,
    cId: clientId,
    _id: relId,
    id: relId,
    jobCategory: {
      _id: jobCat.id,
      id: jobCat.id,
      comments: jobCat.comments,
      createdAt: jobCat.createdAt || new Date(),
      isdeleted: jobCat.isdeleted || 0,
      jobCategory: jobCat.jobCategory,
      updatedAt: jobCat.updatedAt || new Date(),
      agencyId: jobCat.agencyId,
    },
  };
}

async function ensureClient({
  agencyId,
  email,
  companyName,
  companyowner,
  mobile,
  action,
  industry,
  jobCat,
  user,
}) {
  let client = await Clients.findOne({ email, agencyId });
  if (client) return client;

  const id = makeId();
  client = await Clients.create({
    _id: id,
    id,
    companyName,
    companyowner,
    mobile,
    email,
    city: "Surat",
    state: "Gujarat",
    cityId: "Surat",
    stateId: "GJ",
    street: "Seed Street 101",
    zip: "395001",
    businessNature: "Private Limited",
    action,
    agencyId,
    userId: user.id,
    whatsappNotification: true,
    mailNotification: true,
    industries_relation: [buildIndustryRelation(industry, id)],
    jobCategory_relation: [buildJobCategoryRelation(jobCat, id)],
  });
  console.log(`  + Created client: ${companyName} (${action})`);
  return client;
}

async function ensureCandidate({
  agencyId,
  email,
  firstname,
  lastname,
  mobile,
  status,
  interviewStatus,
  gender,
  industry,
  jobCat,
  user,
  jobOpeningId,
}) {
  let candidate = await Candidates.findOne({ email, agencyId });
  if (candidate) {
    if (!candidate.userId) {
      await Candidates.updateOne({ id: candidate.id }, { userId: user.id });
    }
    return candidate;
  }

  const id = makeId();
  candidate = await Candidates.create({
    _id: id,
    id,
    firstname,
    lastname,
    mobile,
    email,
    city: "Surat",
    state: "Gujarat",
    cityId: "Surat",
    stateId: "GJ",
    street: "Candidate Lane",
    zip: "395002",
    status,
    gender,
    interviewStatus,
    agencyId,
    userId: user.id,
    jobOpeningId: jobOpeningId || null,
    industries_relation: [buildIndustryRelation(industry, id)],
    professional: {
      experienceInyear: "3",
      highestQualification: "graduation",
      field: "Engineering",
      course: "B.Tech",
      designation: "Software Developer",
      jobCategoryId: jobCat.id,
      currentEmployer: "Previous Corp",
      currentSalary: 500000,
      expectedsalary: 700000,
      noticePeriod: "30 days",
      currentlyWorking: "yes",
      english: "Good",
      preferedJobLocation: "Surat",
      skill: "JavaScript, React, Node.js",
      jobCategory: {
        _id: jobCat.id,
        id: jobCat.id,
        comments: jobCat.comments,
        createdAt: jobCat.createdAt || new Date(),
        isdeleted: 0,
        jobCategory: jobCat.jobCategory,
        updatedAt: jobCat.updatedAt || new Date(),
        agencyId: jobCat.agencyId,
      },
    },
  });
  console.log(`  + Created candidate: ${firstname} ${lastname} (${status})`);
  return candidate;
}

async function ensureJobOpening({ agencyId, userId, industriesId, jobCategoryId, designation, clientId }) {
  const existing = await JobOpening.findOne({ designation, userId });
  if (existing) return existing;

  const id = makeId();
  const opening = await JobOpening.create({
    _id: id,
    id,
    userId,
    industriesId,
    jobCategoryId,
    numberOfVacancy: 5,
    jobStartTime: "09:00",
    jobEndTime: "18:00",
    sunday: "off",
    minExperienceYears: "2",
    qualification: "graduation",
    field: "Engineering",
    course: "B.Tech",
    designation,
    salaryRangeStart: 400000,
    salaryRangeEnd: 800000,
    negotiable: "yes",
    jobLocation: "Surat",
    basicSkill: "Communication, Teamwork",
    keyRole: designation,
    workingDays: 5,
    plSlCl: 12,
    healthPolicy: "yes",
    pfEsic: 1,
    other: `Seed job for ${designation}`,
    gender: "any",
    workType: "full-time",
    clientId,
    agencyId,
  });
  console.log(`  + Created job opening: ${designation}`);
  return opening;
}

async function ensureLead({ agencyId, email, companyName, industry, jobCat }) {
  let lead = await Lead.findOne({ email, agencyId });
  if (lead) return lead;

  const id = makeId();
  lead = await Lead.create({
    _id: id,
    id,
    companyName,
    companyowner: "Lead Owner",
    mobile: "9898989898",
    email,
    city: "Ahmedabad",
    state: "Gujarat",
    cityId: "Ahmedabad",
    stateId: "GJ",
    street: "Lead Avenue",
    zip: "380001",
    businessNature: "Proprietorship",
    agencyId,
    whatsappNotification: true,
    mailNotification: true,
    industries_relation: [buildIndustryRelation(industry, id)],
    jobCategory_relation: [buildJobCategoryRelation(jobCat, id)],
  });
  console.log(`  + Created lead: ${companyName}`);
  return lead;
}

async function ensureInterview({ agencyId, candidateId, userId, interviewType }) {
  const existing = await Interviews.findOne({ candidateId, interviewType });
  if (existing) return existing;

  const id = makeId();
  const interview = await Interviews.create({
    _id: id,
    id,
    candidateId,
    userId,
    agencyId,
    date: new Date().toISOString().split("T")[0],
    time: new Date(),
    interviewType,
    comments: `Seed ${interviewType} interview`,
    link: "https://meet.google.com/seed-interview",
    isdeleted: 0,
  });
  console.log(`  + Created interview: ${interviewType} for candidate ${candidateId}`);
  return interview;
}

async function ensureJobApplication({ jobOpeningId, candidateId, clientId, status }) {
  const existing = await JobApplication.findOne({ jobOpeningId, candidateId });
  if (existing) return existing;

  const application = await JobApplication.create({
    id: makeId(),
    jobOpeningId,
    candidateId,
    clientId,
    status,
  });
  console.log(`  + Created job application: ${status}`);
  return application;
}

async function ensureResumeEnquiry({ agencyId, candidateId, userId, status }) {
  const existing = await ResumeEnquiry.findOne({ candidateId, status });
  if (existing) return existing;

  const enquiry = await ResumeEnquiry.create({
    id: makeId(),
    candidateId,
    userId,
    agencyId,
    status,
    message: `Seed resume enquiry — ${status}`,
  });
  console.log(`  + Created resume enquiry: ${status}`);
  return enquiry;
}

async function ensureOnBoarding({ agencyId, userId, companyName, status, industriesId, jobCategoryId }) {
  const existing = await OnBoarding.findOne({ companyName, agencyId });
  if (existing) return existing;

  const id = makeId();
  const record = await OnBoarding.create({
    _id: id,
    id,
    userId,
    agencyId,
    industriesId,
    jobCategoryId,
    companyName,
    companyOwner: "Onboarding Owner",
    companyContactNo: "9797979797",
    companyEmail: `onboard-${companyName.toLowerCase().replace(/\s/g, "")}@local.dev`,
    companyStreetAddress: "Onboarding Street",
    companyCity: "Surat",
    companyState: "Gujarat",
    companyPincode: "395003",
    designation: "Operations Manager",
    numberOfVacancy: "3",
    salaryRangeStart: 300000,
    salaryRangeEnd: 600000,
    jobLocation: "Surat",
    status,
    isdeleted: 0,
    gender: "any",
    workType: "full-time",
  });
  console.log(`  + Created onboarding: ${companyName} (${status})`);
  return record;
}

async function seedDummyData() {
  console.log("\n🌱 Starting dummy data seed...\n");

  await mongoose.connect(process.env.DATABASE_URL);
  console.log("✅ Database connected\n");

  const agency = await Agency.findOne({ slug: AGENCY_SLUG });
  if (!agency) {
    throw new Error(`Agency with slug "${AGENCY_SLUG}" not found. Run local setup first.`);
  }
  const agencyId = agency.id;
  console.log(`📌 Using agency: ${agency.name} (${agencyId})\n`);

  // Roles
  console.log("📋 Ensuring roles...");
  const roles = {};
  for (const name of ["Admin", "BDM", "Team Leader", "Recruiter", "Staff", "Client", "Candidate"]) {
    roles[name] = await ensureRole(name);
  }

  // Master data
  console.log("\n🏭 Ensuring industries & job categories...");
  const industryIT = await ensureIndustry(agencyId, "Information Technology");
  const industryManufacturing = await ensureIndustry(agencyId, "Manufacturing");
  const jobCatDev = await ensureJobCategory(agencyId, "Software Development");
  const jobCatSales = await ensureJobCategory(agencyId, "Sales & Marketing");

  // Staff users
  console.log("\n👥 Ensuring staff users...");
  const adminUser = await ensureUser({
    email: "admin@local.dev",
    password: PASSWORDS.admin,
    name: "Local Admin",
    mobile: "9000000001",
    roleId: roles.Admin.id,
    agencyId,
  });

  const staffUsers = await Promise.all([
    ensureUser({
      email: "recruiter1@local.dev",
      password: PASSWORDS.staff,
      name: "Riya Recruiter",
      mobile: "9000000002",
      roleId: roles.Recruiter.id,
      agencyId,
    }),
    ensureUser({
      email: "bdm1@local.dev",
      password: PASSWORDS.staff,
      name: "Bharat BDM",
      mobile: "9000000003",
      roleId: roles.BDM.id,
      agencyId,
    }),
    ensureUser({
      email: "teamlead1@local.dev",
      password: PASSWORDS.staff,
      name: "Tina Team Lead",
      mobile: "9000000004",
      roleId: roles["Team Leader"].id,
      agencyId,
    }),
  ]);

  // Client users & records (different approval states)
  console.log("\n🏢 Ensuring clients...");
  const clientDefs = [
    { email: "client1@local.dev", company: "Alpha Tech Pvt Ltd", owner: "Amit Shah", mobile: "9100000001", action: "approved" },
    { email: "client2@local.dev", company: "Beta Solutions", owner: "Bhavna Patel", mobile: "9100000002", action: "pending" },
    { email: "client3@local.dev", company: "Gamma Industries", owner: "Chirag Mehta", mobile: "9100000003", action: "declined" },
  ];

  const clients = [];
  for (const def of clientDefs) {
    const user = await ensureUser({
      email: def.email,
      password: PASSWORDS.client,
      name: def.owner,
      mobile: def.mobile,
      roleId: roles.Client.id,
      agencyId,
    });
    const client = await ensureClient({
      agencyId,
      email: def.email,
      companyName: def.company,
      companyowner: def.owner,
      mobile: def.mobile,
      action: def.action,
      industry: industryIT,
      jobCat: jobCatDev,
      user,
    });
    clients.push(client);
  }

  // Job openings (linked to approved client)
  console.log("\n💼 Ensuring job openings...");
  const approvedClient = clients[0];
  const jobOpenings = await Promise.all([
    ensureJobOpening({
      agencyId,
      userId: approvedClient.userId,
      industriesId: industryIT.id,
      jobCategoryId: jobCatDev.id,
      designation: "Full Stack Developer",
      clientId: approvedClient.id,
    }),
    ensureJobOpening({
      agencyId,
      userId: approvedClient.userId,
      industriesId: industryManufacturing.id,
      jobCategoryId: jobCatSales.id,
      designation: "Sales Executive",
      clientId: approvedClient.id,
    }),
  ]);

  // Candidate users & records (different statuses)
  console.log("\n🎓 Ensuring candidates...");
  const candidateDefs = [
    { email: "candidate1@local.dev", first: "Priya", last: "Sharma", mobile: "9200000001", status: "new", interviewStatus: "available", gender: "female" },
    { email: "candidate2@local.dev", first: "Rahul", last: "Verma", mobile: "9200000002", status: "shortlisted", interviewStatus: "interviewed", gender: "male" },
    { email: "candidate3@local.dev", first: "Sneha", last: "Desai", mobile: "9200000003", status: "rejected", interviewStatus: "not_available", gender: "female" },
  ];

  const candidates = [];
  for (let i = 0; i < candidateDefs.length; i++) {
    const def = candidateDefs[i];
    const user = await ensureUser({
      email: def.email,
      password: PASSWORDS.candidate,
      name: `${def.first} ${def.last}`,
      mobile: def.mobile,
      roleId: roles.Candidate.id,
      agencyId,
    });
    const candidate = await ensureCandidate({
      agencyId,
      email: def.email,
      firstname: def.first,
      lastname: def.last,
      mobile: def.mobile,
      status: def.status,
      interviewStatus: def.interviewStatus,
      gender: def.gender,
      industry: industryIT,
      jobCat: jobCatDev,
      user,
      jobOpeningId: jobOpenings[0].id,
    });
    candidates.push(candidate);
  }

  // Leads
  console.log("\n📞 Ensuring leads...");
  await Promise.all([
    ensureLead({ agencyId, email: "lead1@local.dev", companyName: "Delta Corp", industry: industryIT, jobCat: jobCatDev }),
    ensureLead({ agencyId, email: "lead2@local.dev", companyName: "Epsilon Traders", industry: industryManufacturing, jobCat: jobCatSales }),
  ]);

  // Interviews
  console.log("\n🗓️  Ensuring interviews...");
  await ensureInterview({
    agencyId,
    candidateId: candidates[1].id,
    userId: staffUsers[0].id,
    interviewType: "technical",
  });
  await ensureInterview({
    agencyId,
    candidateId: candidates[0].id,
    userId: staffUsers[2].id,
    interviewType: "hr",
  });

  // Job applications (different statuses for CRUD testing)
  console.log("\n📝 Ensuring job applications...");
  const appStatuses = ["applied", "viewed", "interviewed"];
  for (let i = 0; i < candidates.length; i++) {
    await ensureJobApplication({
      jobOpeningId: jobOpenings[i % jobOpenings.length].id,
      candidateId: candidates[i].id,
      clientId: approvedClient.id,
      status: appStatuses[i],
    });
  }

  // Resume enquiries
  console.log("\n📄 Ensuring resume enquiries...");
  await ensureResumeEnquiry({ agencyId, candidateId: candidates[0].id, userId: adminUser.id, status: "requested" });
  await ensureResumeEnquiry({ agencyId, candidateId: candidates[1].id, userId: staffUsers[0].id, status: "inreview" });
  await ensureResumeEnquiry({ agencyId, candidateId: candidates[2].id, userId: staffUsers[1].id, status: "completed" });

  // Onboarding records
  console.log("\n🚀 Ensuring onboarding records...");
  await ensureOnBoarding({
    agencyId,
    userId: adminUser.id,
    companyName: "Zeta Onboarding Co",
    status: "pending",
    industriesId: industryIT.id,
    jobCategoryId: jobCatDev.id,
  });
  await ensureOnBoarding({
    agencyId,
    userId: staffUsers[0].id,
    companyName: "Omega Onboarding Co",
    status: "approved",
    industriesId: industryManufacturing.id,
    jobCategoryId: jobCatSales.id,
  });

  // Print credentials summary
  console.log("\n" + "=".repeat(60));
  console.log("🔐 TEST CREDENTIALS");
  console.log("=".repeat(60));
  console.log(`\nAgency: ${agency.name}`);
  console.log(`Agency ID: ${agencyId}`);
  console.log(`Agency Slug: ${agency.slug}`);
  console.log(`Login URL: http://localhost:3000/login`);
  console.log(`Super Admin URL: http://localhost:3000/superadmin/login`);

  console.log("\n--- SUPER ADMIN (existing) ---");
  console.log("Email:    superadmin@local.dev");
  console.log("Password: Admin@123");

  console.log("\n--- AGENCY ADMIN ---");
  console.log("Email:    admin@local.dev");
  console.log("Password: Admin@123");
  console.log(`AgencyId: ${agencyId}`);

  console.log("\n--- STAFF ---");
  console.log("Recruiter  | recruiter1@local.dev  | Staff@123");
  console.log("BDM        | bdm1@local.dev        | Staff@123");
  console.log("Team Lead  | teamlead1@local.dev   | Staff@123");
  console.log(`(All staff use AgencyId: ${agencyId})`);

  console.log("\n--- CLIENTS ---");
  console.log("Approved   | client1@local.dev | Client@123 | Alpha Tech Pvt Ltd");
  console.log("Pending    | client2@local.dev | Client@123 | Beta Solutions");
  console.log("Declined   | client3@local.dev | Client@123 | Gamma Industries");

  console.log("\n--- CANDIDATES ---");
  console.log("New        | candidate1@local.dev | Candidate@123 | Priya Sharma");
  console.log("Shortlisted| candidate2@local.dev | Candidate@123 | Rahul Verma");
  console.log("Rejected   | candidate3@local.dev | Candidate@123 | Sneha Desai");

  console.log("\n--- SEEDED DATA SUMMARY ---");
  const counts = {
    users: await Users.countDocuments({ agencyId }),
    clients: await Clients.countDocuments({ agencyId }),
    candidates: await Candidates.countDocuments({ agencyId }),
    jobOpenings: await JobOpening.countDocuments({}),
    leads: await Lead.countDocuments({ agencyId }),
    interviews: await Interviews.countDocuments({ agencyId }),
    jobApplications: await JobApplication.countDocuments({}),
    resumeEnquiries: await ResumeEnquiry.countDocuments({ agencyId }),
    onboarding: await OnBoarding.countDocuments({ agencyId }),
  };
  Object.entries(counts).forEach(([k, v]) => console.log(`  ${k}: ${v}`));

  console.log("\n" + "=".repeat(60));
  console.log("✅ Seed completed successfully!");
  console.log("=".repeat(60) + "\n");

  await mongoose.connection.close();
}

if (require.main === module) {
  seedDummyData()
    .then(() => process.exit(0))
    .catch(async (err) => {
      console.error("❌ Seed failed:", err);
      await mongoose.connection.close();
      process.exit(1);
    });
}

module.exports = { seedDummyData };
