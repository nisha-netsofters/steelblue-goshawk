const Candidates = require("../models-v2/candidates_Mongoose");
const Industries = require("../models-v2/industries_Mongoose");
const {
  sendBulkMail,
  sendcandidateRegistrationSuccessfully,
  newCandidatewelcomeEmail,
  sendtoAllClientmailAdded,
  sendCandidateLoginCredentials,
} = require("../middleware/Emails/email");
const { awsUploadFiles } = require("../middleware/awsS3");
const { raw } = require("objection");
const { sendWhatsappMSG } = require("../middleware/whatsappMSG/whatsapp");
const { sendWelcomeWhatsapp } = require("../middleware/whatsappMSG/welcomeMessage");
const Professional = require("../models-v2/professional_Mongoose");
const mongoose = require("mongoose");
const JobCategory = require("../models-v2/jobCategory_Mongoose");
const JobSubCategory = require("../models-v2/jobSubCategory_Mongoose");
const Users = require("../models-v2/users_Mongoose");
const InterviewRequest = require("../models-v2/interviewRequest_Mongoose");
const agency = require("../models-v2/agency_Mongooes");
const { json } = require("body-parser");
const Agency = require("../models-v2/agency_Mongooes");
const viewCandidates = require("../models-v2/viewCandidates_Mongoose");
const moment = require("moment");
const interviewStatus = require("../models-v2/interviewStatus_Mongoose");
const { interviews } = require("./dashboard");
const Interviews = require("../models-v2/interviews_Mongoose");
const Clients = require("../models-v2/clients_Mongoose");
const Subscription = require("../models-v2/subscriptions_Mongoose");
const Orderofpayments = require("../models-v2/orderOfPayments_Mongoose");
const Role = require("../models-v2/role_Mongoose");
const bcrypt = require("bcryptjs");
const { enqueueEmailJob } = require("../mq/emailProducer");
const JobOpening = require("../models-v2/jobOpening_Mongoose");
const JobApplication = require("../models-v2/jobApplication_Mongoose");
const ResumeEnquiry = require("../models-v2/resumeEnquiry_Mongoose");

/** Users.mobile is maxlength 10 — strip +91/91/0 and keep last 10 digits */
function normalizeIndianMobile(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length > 10) return digits.slice(-10);
  return digits;
}

/**
 * Optional tiny bridges only — primary mapping is AI picking exact names
 * from DB master list during resume parse (see resumeParser.applyMasterJobCategoryFromAi).
 * Do NOT grow this into a long dictionary; prefer improving the AI master-list prompt.
 */
const JOB_SUB_ROLE_ALIASES = {};

/** Same rule as candidate form UI: Expected = Current × 1.2 */
function syncExpectedSalaryFromCurrent(professional = {}) {
  const prof =
    professional && typeof professional === "object" ? { ...professional } : {};
  const current = Number(prof.currentSalary);
  if (Number.isFinite(current) && current > 0) {
    prof.expectedsalary = Math.round(current * 1.2);
  } else {
    const expected = Number(prof.expectedsalary);
    if (Number.isFinite(expected) && expected > 0) {
      prof.expectedsalary = Math.round(expected);
    }
  }
  return prof;
}

/**
 * Resolve professional.jobCategoryId from Job Category master list only.
 * Uses designation + experience titles (+ skills only as support).
 * Skill / section labels alone never invent a category.
 * Not in master list → do not save.
 */
async function resolveProfessionalJobCategory(professional = {}, extra = {}) {
  const prof =
    professional && typeof professional === "object" ? { ...professional } : {};

  const existingObj =
    prof.jobCategory && typeof prof.jobCategory === "object"
      ? prof.jobCategory
      : null;
  const rawId = String(
    prof.jobCategoryId || existingObj?.id || existingObj?._id || ""
  ).trim();

  const normalize = (s) =>
    String(s || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const stop = new Set([
    "and",
    "the",
    "for",
    "job",
    "jobs",
    "category",
    "it",
    "senior",
    "junior",
    "lead",
    "with",
    "from",
    "year",
    "years",
  ]);

  const weakToken = new Set([
    "analytics",
    "analysis",
    "data",
    "science",
    "leadership",
    "teamwork",
    "communication",
    "problem",
    "solving",
    "innovation",
    "inovation",
    "collaboration",
    "management",
    "support",
    "service",
    "customer",
    "sales",
    "marketing",
    "digital",
    "computer",
    "office",
    "admin",
    "general",
    "banking",
    "finance",
    "financial",
    "literacy",
    "employment",
    "certificate",
    "certification",
    "certified",
    "course",
    "training",
    "technical",
    "professional",
    "soft",
    "skill",
    "skills",
    "key",
    "core",
    "set",
    "summary",
  ]);

  const tokenize = (s) =>
    normalize(s)
      .split(" ")
      .filter((t) => t.length > 2 && !stop.has(t));

  const tokensMatch = (a, b) => {
    if (!a || !b) return false;
    if (a === b) return true;
    let i = 0;
    while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
    if (Math.min(a.length, b.length) >= 6 && i >= 5) return true;
    const shorter = a.length <= b.length ? a : b;
    const longer = a.length <= b.length ? b : a;
    if (shorter.length >= 5 && longer.startsWith(shorter)) return true;
    if (shorter.length >= 6 && longer.includes(shorter)) return true;
    return false;
  };

  const isUsableDesignation = (text) => {
    const t = String(text || "")
      .replace(/^[\s•·\-–—*]+/, "")
      .trim();
    if (!t || t.length < 3) return false;
    if (/^s:$/i.test(t) || /^[:\-–—•·*|]+$/.test(t)) return false;
    const words = t.split(/\s+/).filter(Boolean);
    if (words.length > 10) return false;
    if (
      /\b(seek|seeking|challenging|opportunit|looking for|objective|career goal|success of the|fully use my skills)\b/i.test(
        t
      )
    ) {
      return false;
    }
    if (/[.!?]$/.test(t) && words.length > 6) return false;
    // Company / place name as designation (e.g. "Jyoti classes", "Reeta Fashion")
    const titleWord =
      /\b(executive|associate|manager|officer|engineer|accountant|cashier|champion|assistant|operator|developer|analyst|fresher|trainee|intern|billing|sales|hr|admin|receptionist|coordinator|specialist|clerk)\b/i.test(
        t
      );
    if (
      !titleWord &&
      /\b(pvt|ltd|limited|private|company|classes|fashion|solutions|technologies|industries|llp|school|college)\b/i.test(
        t
      )
    ) {
      return false;
    }
    if (!titleWord && words.length <= 3 && /^[A-Z][a-z]+(\s+[A-Z][a-z]+)+$/.test(t)) {
      // "Reeta Fashion" style without role word
      return false;
    }
    return true;
  };

  const cleanSkillText = (raw) =>
    String(raw || "")
      .replace(
        /\b((technical|professional|soft|key|core|computer|personal|additional)\s+)?skills?\s*(set|summary)?\b[:\-–—]*/gi,
        " "
      )
      .replace(/\b(technical|professional|soft)\s+skills?\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim();

  /**
   * Strong designation / skill / experience signals → master sub name.
   * Soft-skill-only never returns a category.
   */
  const inferCanonicalFromSignals = (designationNorm, roleJoined, skillJoined) => {
    const hay = `${designationNorm} ${roleJoined} ${skillJoined}`.trim();
    if (!hay) return "";

    if (/\bbilling(\s+work)?\b/.test(designationNorm) || /\bbilling(\s+work)?\b/.test(roleJoined)) {
      return "Billing Executive";
    }
    if (/\bbrand\s+champion\b/.test(designationNorm) || /\bbrand\s+champion\b/.test(roleJoined)) {
      return "Brand Executive";
    }
    if (/^accounting$/.test(designationNorm) || /^accountant$/.test(designationNorm)) {
      return "Accountant";
    }

    const hasTally = /\b(tally|telly)\b/.test(hay);
    const hasAcctSignal =
      /\b(gst|vat|tax|journal|invoice|account|accounting|book\s*keep|payable|receivable|purchase|sale)\b/.test(
        hay
      );
    if (hasTally && hasAcctSignal) return "Accountant";
    if (hasTally && /\bfresher\b/.test(designationNorm)) return "Accountant";

    const hasDataEntry = /\bdata\s*entry\b/.test(hay);
    const domainClash =
      /\bmarketing\b/.test(skillJoined) &&
      /\b(account|accounting)\b/.test(skillJoined) &&
      hasDataEntry;
    if (
      hasDataEntry &&
      !domainClash &&
      (!designationNorm ||
        /\b(fresher|data\s*entry)\b/.test(designationNorm) ||
        !/\b(engineer|developer|nurse|teacher|doctor|sales|marketing)\b/.test(
          designationNorm
        ))
    ) {
      return "Data Entry";
    }

    if (/\bseo\b/.test(designationNorm) || /\bseo\b/.test(roleJoined)) {
      return "SEO Executive";
    }

    if (
      /\bbrand\s+promotion\b/.test(skillJoined) &&
      /\b(brand|champion|promotion|demonstration)\b/.test(hay) &&
      !/\b(accountant|engineer|developer|cashier)\b/.test(designationNorm)
    ) {
      // only if designation already brand-related or empty after cleanup
      if (!designationNorm || /\bbrand\b/.test(designationNorm)) {
        return "Brand Executive";
      }
    }

    return "";
  };

  /** Real job-title patterns only — not skill words alone. */
  const isStrongSalesTitle = (text) => {
    const t = normalize(text);
    if (!t) return false;
    if (
      /\b(receptionist|developer|engineer|accountant|nurse|teacher|driver|cashier|scientist|doctor)\b/.test(
        t
      )
    ) {
      return false;
    }
    return (
      /\bsales\s+(executive|manager|officer|associate|representative|rep|consultant|head|lead|coordinator|specialist|trainee|intern)\b/.test(
        t
      ) || /\b(business\s+development|sales\s+and\s+marketing)\b/.test(t)
    );
  };

  const isStrongMarketingTitle = (text) => {
    const t = normalize(text);
    if (!t) return false;
    return /\b(marketing|digital\s+marketing)\s+(executive|manager|officer|associate|specialist|coordinator|trainee|intern)\b/.test(
      t
    );
  };

  const nearMatchSubScore = (roleNorm, designationNorm, subName) => {
    const pairs = [
      [/\bsales\s+(associate|representative|rep)\b/, /^sales\s+executive$/],
      [/\bretail\s+sales\s+associate\b/, /^retail\s+sales\s+executive$/],
      [
        /\b(assistant\s+accountant|accounts?\s+assistant|accounts?\s+executive|^accounting$)\b/,
        /^accountant$/,
      ],
      [
        /\b(business\s+process\s+associate|process\s+associate|\bbpo\b)\b/,
        /^process\s+associate$/,
      ],
      [/\bdata\s+entry(\s+operator|\s+executive)?\b/, /^data\s+entry$/],
      [/\bpurchase\s+associate\b/, /^purchase\s+executive$/],
      [/\bmarketing\s+associate\b/, /^marketing\s+executive$/],
      [/\bcivil\s+eng(g|ineer)?\b/, /^civil\s+engineer$/],
      [/\bbilling(\s+work)?\b/, /^billing\s+executive$/],
      [/\bbrand\s+champion\b/, /^brand\s+executive$/],
      [/\bseo(\s+manager|\s+executive|\s+specialist|\s+lead)?\b/, /^seo\s+executive$/],
    ];
    const hay = `${roleNorm} ${designationNorm}`.trim();
    for (const [roleRe, subRe] of pairs) {
      if (roleRe.test(hay) && subRe.test(subName)) return 90;
    }
    return 0;
  };

  const roleLevelWeak = new Set([
    "manager",
    "executive",
    "officer",
    "assistant",
    "associate",
    "specialist",
    "coordinator",
    "consultant",
    "head",
    "lead",
    "intern",
    "trainee",
    "senior",
    "junior",
  ]);

  const scoreSubTokenMatch = (name, roleToks, skillToks) => {
    const nameTokens = tokenize(name);
    const strongNameTokens = nameTokens.filter(
      (t) => !roleLevelWeak.has(t) && !weakToken.has(t)
    );
    if (!strongNameTokens.length) return 0;
    const fromRole = strongNameTokens.filter((n) =>
      roleToks.some((t) => tokensMatch(t, n))
    );
    if (!fromRole.length) return 0;
    const covered = strongNameTokens.filter(
      (n) =>
        roleToks.some((t) => tokensMatch(t, n)) ||
        skillToks.some((t) => tokensMatch(t, n))
    );
    if (covered.length === strongNameTokens.length) return 88;
    if (fromRole.length === strongNameTokens.length) return 90;
    return 0;
  };

  const experienceList = Array.isArray(extra.experience)
    ? extra.experience
    : Array.isArray(prof.experience)
      ? prof.experience
      : [];
  const expTitles = experienceList
    .map((e) =>
      [e?.title, e?.designation, e?.role].filter(Boolean).join(" ").trim()
    )
    .filter((t) => isUsableDesignation(t));
  const titleCounts = {};
  for (const t of expTitles) {
    const k = normalize(t);
    if (!k) continue;
    titleCounts[k] = (titleCounts[k] || 0) + 1;
  }
  let mostCommonTitle = "";
  let mostCommonN = 0;
  for (const [k, n] of Object.entries(titleCounts)) {
    if (n > mostCommonN) {
      mostCommonN = n;
      mostCommonTitle = k;
    }
  }
  const latestTitle = expTitles[0] || "";

  let designation = String(prof.designation || "").trim();
  if (!isUsableDesignation(designation)) {
    const fallback =
      expTitles.find((t) => isUsableDesignation(t)) ||
      latestTitle ||
      mostCommonTitle ||
      "";
    designation = isUsableDesignation(fallback) ? fallback : "";
    prof.designation = designation;
  }

  const skillText = cleanSkillText(
    Array.isArray(prof.skill)
      ? prof.skill.join(" ")
      : String(prof.skill || prof.skills || extra.skill || "")
  );
  if (Array.isArray(prof.skill)) {
    // keep array but cleaned joined string used for matching only
  } else if (prof.skill || prof.skills) {
    prof.skill = skillText;
  }

  const industryText = String(
    extra.industry ||
      prof.industry ||
      (Array.isArray(extra.industries) ? extra.industries.join(" ") : "")
  );

  const designationNorm = normalize(designation);
  const skillJoined = normalize(skillText);
  const roleJoinedPre = normalize(
    [designation, latestTitle, mostCommonTitle, ...expTitles].join(" ")
  );
  const aliasCanonical =
    JOB_SUB_ROLE_ALIASES[designationNorm] ||
    JOB_SUB_ROLE_ALIASES[normalize(latestTitle)] ||
    inferCanonicalFromSignals(designationNorm, roleJoinedPre, skillJoined) ||
    "";

  const roleJoined = normalize(
    [
      designation,
      aliasCanonical,
      latestTitle,
      mostCommonTitle,
      ...expTitles,
    ].join(" ")
  );
  const industryJoined = normalize(industryText);
  const roleTokens = tokenize(roleJoined);
  const skillTokens = tokenize(skillJoined);
  const industryTokens = tokenize(industryJoined);

  let doc = null;
  let subDoc = null;
  const rawSubId = String(
    prof.jobSubCategoryId ||
      (prof.jobSubCategory && typeof prof.jobSubCategory === "object"
        ? prof.jobSubCategory.id || prof.jobSubCategory._id
        : "") ||
      ""
  ).trim();

  // Explicit category from client/UI always wins over stale subcategory parent.
  // (Edit flow often clears sub category while changing category — old sub id
  // must not force the previous category back.)
  if (rawId) {
    doc = await JobCategory.findOne({ id: rawId }).lean();
  }
  if (rawSubId) {
    subDoc = await JobSubCategory.findOne({ id: rawSubId }).lean();
    if (
      subDoc?.jobCategoryId &&
      doc &&
      String(subDoc.jobCategoryId) !== String(doc.id)
    ) {
      // Sub belongs to a different category than the one user selected — drop it
      subDoc = null;
    }
    if (!doc && subDoc?.jobCategoryId) {
      doc = await JobCategory.findOne({ id: subDoc.jobCategoryId }).lean();
    }
  }

  const explicitCategoryTrusted = Boolean(doc && rawId && String(doc.id) === String(rawId));

  // Only second-guess category when it was NOT an explicit valid client pick
  // (manual edit / form save must keep the selected Job Category).
  if (doc && designation && !explicitCategoryTrusted) {
    const nameTokens = tokenize(normalize(doc.jobCategory));
    const overlap = nameTokens.filter((n) =>
      roleTokens.some((t) => tokensMatch(t, n))
    );
    const hasRole = roleTokens.some((t) => t.length >= 5);
    const subHit = await JobSubCategory.findOne({
      jobCategoryId: doc.id,
      jobSubCategory: new RegExp(
        `^${String(designation).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
        "i"
      ),
    }).lean();
    const aliasHit = aliasCanonical
      ? await JobSubCategory.findOne({
          jobCategoryId: doc.id,
          jobSubCategory: new RegExp(
            `^${String(aliasCanonical).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
            "i"
          ),
        }).lean()
      : null;
    if (
      hasRole &&
      overlap.length === 0 &&
      !subHit &&
      !aliasHit &&
      !isStrongSalesTitle(designation) &&
      !isStrongMarketingTitle(designation)
    ) {
      doc = null;
      subDoc = null;
    } else if (subHit) {
      subDoc = subHit;
    } else if (aliasHit) {
      subDoc = aliasHit;
    }
  } else if (doc && designation && explicitCategoryTrusted && !subDoc) {
    // Keep category; optionally attach matching sub under that category only
    const subHit = await JobSubCategory.findOne({
      jobCategoryId: doc.id,
      jobSubCategory: new RegExp(
        `^${String(designation).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
        "i"
      ),
    }).lean();
    const aliasHit = aliasCanonical
      ? await JobSubCategory.findOne({
          jobCategoryId: doc.id,
          jobSubCategory: new RegExp(
            `^${String(aliasCanonical).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
            "i"
          ),
        }).lean()
      : null;
    if (subHit) subDoc = subHit;
    else if (aliasHit) subDoc = aliasHit;
  }

  // Prefer Job Sub Category from designation / aliases / near-match titles
  // Skip rematch when user already picked a valid category explicitly.
  if (!subDoc && roleJoined && !explicitCategoryTrusted) {
    const allSubs = await JobSubCategory.find({})
      .select("id jobCategoryId jobSubCategory")
      .lean();
    let bestSub = null;
    let bestSubScore = 0;
    for (const s of allSubs) {
      const name = normalize(s.jobSubCategory);
      if (!name || name.length < 3) continue;
      let score = 0;
      if (aliasCanonical && name === normalize(aliasCanonical)) score = 98;
      else if (roleJoined === name || designationNorm === name) score = 100;
      else if (name.length >= 5 && roleJoined.includes(name)) score = 95;
      else if (name.length >= 5 && designationNorm.includes(name)) score = 92;
      else {
        score = Math.max(
          score,
          nearMatchSubScore(roleJoined, designationNorm, name)
        );
        score = Math.max(
          score,
          scoreSubTokenMatch(name, roleTokens, skillTokens)
        );
      }
      if (score > bestSubScore) {
        bestSubScore = score;
        bestSub = s;
      }
    }
    if (bestSub && bestSubScore >= 88) {
      subDoc = bestSub;
      doc = await JobCategory.findOne({ id: bestSub.jobCategoryId }).lean();
    }
  }

  if (!doc && !explicitCategoryTrusted) {
    const all = await JobCategory.find({}).select("id jobCategory").lean();
    let best = null;
    let bestScore = 0;

    for (const j of all) {
      const name = normalize(j.jobCategory);
      if (!name || name.length < 3) continue;
      const nameTokens = tokenize(name);
      if (!nameTokens.length) continue;

      let score = 0;
      const roleMatched = nameTokens.filter((n) =>
        roleTokens.some((t) => tokensMatch(t, n))
      );
      const skillMatched = nameTokens.filter((n) =>
        skillTokens.some((t) => tokensMatch(t, n))
      );
      const industryMatched = nameTokens.filter((n) =>
        industryTokens.some((t) => tokensMatch(t, n))
      );
      const combined = [
        ...new Set([...roleMatched, ...skillMatched, ...industryMatched]),
      ];
      const strong = (arr) => arr.filter((t) => !weakToken.has(t));
      const coverage = (arr) => arr.length / nameTokens.length;
      const allWeak = nameTokens.every((t) => weakToken.has(t));

      if (roleJoined === name || (name.length >= 5 && roleJoined.includes(name))) {
        score = Math.max(score, 100);
      }
      if (name.length >= 5 && skillJoined.includes(name) && roleMatched.length) {
        score = Math.max(score, 90);
      }

      // Strong title → matching family category (never from skills alone)
      if (isStrongSalesTitle(roleJoined) || isStrongSalesTitle(designation)) {
        if (
          (name.includes("sales") && name.includes("business")) ||
          (name.includes("sales") && name.includes("marketing")) ||
          name === "sales business development"
        ) {
          score = Math.max(score, 88);
        }
      }
      if (
        isStrongMarketingTitle(roleJoined) ||
        isStrongMarketingTitle(designation)
      ) {
        if (name.includes("marketing") && !name.includes("sales")) {
          score = Math.max(score, 88);
        }
      }

      if (nameTokens.length === 1) {
        const tok = nameTokens[0];
        if (roleMatched.length === 1 && !(weakToken.has(tok) && tok.length < 8)) {
          score = Math.max(score, 80);
        }
      } else if (roleMatched.length > 0) {
        if (
          coverage(roleMatched) >= 0.99 ||
          (roleMatched.length >= 2 && strong(roleMatched).length >= 1)
        ) {
          score = Math.max(
            score,
            Math.round(coverage(roleMatched) * 70) +
              strong(roleMatched).length * 12 +
              roleMatched.length * 6
          );
        }
        if (
          coverage(roleMatched) >= 0.45 &&
          roleMatched.some((t) => t.length >= 6 || !weakToken.has(t)) &&
          (name.includes("finance") || name.includes("account"))
        ) {
          score = Math.max(score, 82);
        }
        if (
          allWeak &&
          (roleMatched.length === nameTokens.length ||
            (roleMatched.length >= 2 && coverage(roleMatched) >= 0.66))
        ) {
          score = Math.max(score, 86);
        }
      }

      // Skills only support a role decision — never win alone
      if (
        roleMatched.length >= 1 &&
        (skillMatched.length >= 1 || industryMatched.length >= 1)
      ) {
        if (combined.length >= 2 && strong(combined).length >= 1) {
          score = Math.max(
            score,
            Math.round(coverage(combined) * 68) + strong(combined).length * 10
          );
        }
        score += Math.min(4, skillMatched.length + industryMatched.length);
      }

      const roleConflicts =
        roleTokens.some((t) => t.length >= 5) &&
        roleMatched.length === 0 &&
        !isStrongSalesTitle(roleJoined) &&
        !isStrongMarketingTitle(roleJoined);
      if (roleConflicts && score < 92) continue;

      // Skill-only / label-only / cert-only → never invent category
      if (!roleMatched.length && score < 88) {
        continue;
      }
      if (!roleMatched.length && !isStrongSalesTitle(roleJoined) && !isStrongMarketingTitle(roleJoined)) {
        continue;
      }

      if (
        score < 84 &&
        nameTokens.length >= 2 &&
        combined.length <= 1 &&
        combined.every((t) => weakToken.has(t))
      ) {
        continue;
      }
      if (score < 72) continue;
      if (score > bestScore) {
        bestScore = score;
        best = j;
      }
    }
    doc = best;
  }

  if (doc?.id) {
    prof.jobCategoryId = String(doc.id);
    prof.jobCategory = {
      id: doc.id,
      jobCategory: doc.jobCategory,
    };
  } else {
    delete prof.jobCategoryId;
    delete prof.jobCategory;
    delete prof.jobCategoryName;
  }

  if (subDoc?.id) {
    prof.jobSubCategoryId = String(subDoc.id);
    prof.jobSubCategory = {
      id: subDoc.id,
      jobSubCategory: subDoc.jobSubCategory,
      jobCategoryId: subDoc.jobCategoryId,
    };
  } else {
    delete prof.jobSubCategoryId;
    delete prof.jobSubCategory;
  }

  return prof;
}

function parseJsonArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }
  return [];
}

/**
 * Keep Users.mobile / Users.email in sync with candidate profile.
 * If login password is still the old default (previous mobile), rotate it
 * to the new 10-digit mobile so candidate login does not fail.
 */
async function syncCandidateLoginUser(
  user,
  nextMobileRaw,
  nextEmailRaw,
  nameParts = null
) {
  if (!user?.id) return;
  const nextMobile = normalizeIndianMobile(nextMobileRaw);
  const nextEmail = String(nextEmailRaw || "")
    .trim()
    .toLowerCase();
  const updates = {};

  if (nextMobile.length === 10) {
    const oldMobile = normalizeIndianMobile(user.mobile);
    if (oldMobile !== nextMobile) updates.mobile = nextMobile;

    let passwordIsOldMobile = false;
    const stored = String(user.password || "");
    const looksBcrypt = stored.startsWith("$2");
    if (oldMobile && stored) {
      if (user.isBcrypt || looksBcrypt) {
        try {
          passwordIsOldMobile = await bcrypt.compare(oldMobile, stored);
        } catch (e) {
          passwordIsOldMobile = false;
        }
      } else {
        passwordIsOldMobile = stored === oldMobile;
      }
    }

    if (!stored || passwordIsOldMobile) {
      updates.password = await bcrypt.hash(nextMobile, 10);
      updates.isBcrypt = true;
    }
  }

  // Email edit on candidate must update login email (same agency, no conflict)
  if (nextEmail && String(user.email || "").toLowerCase() !== nextEmail) {
    const emailConflict = await Users.findOne({
      email: nextEmail,
      agencyId: user.agencyId,
      id: { $ne: user.id },
    });
    if (!emailConflict) {
      updates.email = nextEmail;
    } else {
      console.warn(
        "syncCandidateLoginUser: email already used by another user, skip email sync",
        nextEmail
      );
    }
  }

  if (nameParts) {
    const name =
      `${nameParts.firstname || ""} ${nameParts.lastname || ""}`.trim();
    if (name && name !== user.name) updates.name = name;
  }

  if (Object.keys(updates).length) {
    await Users.updateOne({ id: user.id }, { $set: updates });
  }
}

/**
 * After candidate create/update: ensure a Candidate-role login user exists
 * and matches current email + mobile (so email edit still allows login).
 */
async function ensureCandidateLoginUser(candidate) {
  if (!candidate?.id) return;
  const email = String(candidate.email || "").trim().toLowerCase();
  const mobile = normalizeIndianMobile(candidate.mobile);
  const agencyId = candidate.agencyId;
  if (!email || !agencyId) return;

  let candidateRole = await Role.findOne({ name: "Candidate" });
  if (!candidateRole) {
    console.warn("ensureCandidateLoginUser: Candidate role not found");
    return;
  }

  let user = candidate.userId
    ? await Users.findOne({ id: candidate.userId })
    : null;

  const emailMismatch = (linkedUser) =>
    String(linkedUser?.email || "").toLowerCase() !== email;
  const wrongRole = (linkedUser) =>
    String(linkedUser?.roleId || "") !== String(candidateRole.id);

  // Never reuse Client/other-role logins; unlink when client email no longer matches
  if (user && (wrongRole(user) || emailMismatch(user))) {
    user = null;
  } else if (user) {
    const siblingCount = await Candidates.countDocuments({
      userId: user.id,
      id: { $ne: candidate.id },
    });
    if (siblingCount > 0 && emailMismatch(user)) {
      user = null;
    }
  }

  if (!user) {
    user = await Users.findOne({
      email,
      agencyId,
      roleId: candidateRole.id,
    });
  }

  if (!user) {
    if (mobile.length !== 10) {
      console.warn(
        "ensureCandidateLoginUser: cannot create user — invalid mobile",
        candidate.id
      );
      return;
    }
    const objectIdUserData = new mongoose.Types.ObjectId();
    const hashedPassword = await bcrypt.hash(mobile, 10);
    const userName =
      `${candidate.firstname || ""} ${candidate.lastname || ""}`.trim() ||
      email;
    user = await Users.create({
      id: objectIdUserData,
      _id: objectIdUserData,
      roleId: candidateRole.id,
      name: userName,
      email,
      password: hashedPassword,
      mobile,
      agencyId,
      isBcrypt: true,
    });
  } else {
    await syncCandidateLoginUser(user, mobile, email, {
      firstname: candidate.firstname,
      lastname: candidate.lastname,
    });
  }

  if (String(candidate.userId || "") !== String(user.id)) {
    await Candidates.updateOne(
      { id: candidate.id },
      { $set: { userId: user.id } }
    );
  }
}

exports.ensureCandidateLoginUser = ensureCandidateLoginUser;

function hasMeaningfulUpdateValue(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") {
    return Object.values(value).some(hasMeaningfulUpdateValue);
  }
  return true;
}

function mergeUpdatePreserveExisting(existing, incoming) {
  const base =
    existing && typeof existing === "object"
      ? JSON.parse(JSON.stringify(existing))
      : {};
  if (!incoming || typeof incoming !== "object") return base;
  const merged = { ...base };
  for (const [key, value] of Object.entries(incoming)) {
    if (!hasMeaningfulUpdateValue(value)) continue;
    if (
      typeof value === "object" &&
      !Array.isArray(value) &&
      value !== null &&
      typeof merged[key] === "object" &&
      merged[key] !== null &&
      !Array.isArray(merged[key])
    ) {
      merged[key] = mergeUpdatePreserveExisting(merged[key], value);
    } else {
      merged[key] = value;
    }
  }
  return merged;
}

let calculateProfileCompleteness;
let buildProfileCompletenessAddFieldsStages;
let getProfileCompletionMatchStage;
try {
  ({
    calculateProfileCompleteness,
    buildProfileCompletenessAddFieldsStages,
    getProfileCompletionMatchStage,
  } = require("../services/profileCompleteness"));
} catch (e) {
  console.error("profileCompleteness load failed:", e.message);
  calculateProfileCompleteness = () => 0;
  buildProfileCompletenessAddFieldsStages = () => [];
  getProfileCompletionMatchStage = () => null;
}

let getQuickFilterEarlyMatch;
let getQuickFilterStatusMatch;
let getQuickFilterPostViewStages;
let getCandidateViewStatusStages;
let quickFilterNeedsViewStages;
let quickFilterNeedsStatusStages;
let getInterviewStatusStages;
try {
  ({
    getQuickFilterEarlyMatch,
    getQuickFilterStatusMatch,
    getQuickFilterPostViewStages,
    getCandidateViewStatusStages,
    quickFilterNeedsViewStages,
    quickFilterNeedsStatusStages,
    getInterviewStatusStages,
  } = require("../services/candidateQuickFilter"));
} catch (e) {
  console.error("candidateQuickFilter load failed:", e.message);
  getQuickFilterEarlyMatch = () => ({});
  getQuickFilterStatusMatch = () => null;
  getQuickFilterPostViewStages = () => [];
  getCandidateViewStatusStages = () => [];
  quickFilterNeedsViewStages = () => false;
  quickFilterNeedsStatusStages = () => false;
  getInterviewStatusStages = () => [];
}

let getClientVisibleCommentsStages;
let getLatestInternalCommentStages;
try {
  ({
    getClientVisibleCommentsStages,
    getLatestInternalCommentStages,
  } = require("../services/recruiterInternalCommentStages"));
} catch (e) {
  console.error("recruiterInternalCommentStages load failed:", e.message);
  getClientVisibleCommentsStages = () => [];
  getLatestInternalCommentStages = () => [];
}

/**
 * Candidate self statistics (lifetime) for candidate login.
 *
 * Returns counts that are scoped only to the logged‑in candidate:
 * - profileCompleteness: 0–100 based on key profile fields filled
 * - onboardedJobs: number of distinct onboarded jobs the candidate has been associated with
 * - totalInterviews / interviewsScheduled / interviewsAttended
 * - hired / rejected / reviewPending
 * - jobsApplied / jobMatches / pendingInterviewRequests
 *
 * Authentication: requires `verifyAuth` middleware.
 * Assumes `req.user` is a Users document with populated `role` and `agencyId`.
 */
exports.getCandidateSelfStatistics = async (req, res) => {
  try {
    const authUser = req.user;
    const candidateIdParam = req.params.candidateId;

    if (!authUser || !authUser.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Ensure only Candidate role can access this endpoint
    if (!authUser.role || authUser.role.name !== "Candidate") {
      return res.status(403).json({ error: "Access denied" });
    }

    const agencyId = authUser.agencyId;

    // ---------- Resolve candidate ----------
    const candidateQuery = candidateIdParam
      ? {
        id: candidateIdParam,
        ...(agencyId ? { agencyId } : {}),
      }
      : {
        userId: authUser.id,
        ...(agencyId ? { agencyId } : {}),
      };

    // Fields required for profile completeness must match services/profileCompleteness.js
    const candidate = await Candidates.findOne(candidateQuery)
      .select(
        "id userId agencyId firstname lastname mobile alternateMobile email gender state stateId city cityId resume professional industries_relation jobOpeningId"
      )
      .lean();

    if (!candidate) {
      return res.status(404).json({ error: "Candidate profile not found" });
    }

    // Normalize ID to string for consistent querying
    const candidateId = String(candidate.id);

    // ---------- Profile completeness (weighted mandatory sections) ----------
    const professional = candidate.professional || {};
    const {
      profileCompleteness,
      profileCompletenessLabel,
      profileCompletenessBreakdown,
    } = calculateProfileCompleteness(candidate);

    // ---------- Derived fields for job matching logic ----------
    const jobCategoryId = professional.jobCategoryId;
    const industriesId = candidate.industries_relation?.[0]?.industriesId;
    const expectedSalary = professional.expectedsalary || 0;

    const candidateExperience = (() => {
      const exp = professional.experienceInyear;
      if (!exp || typeof exp !== "string") return 0;
      const match = exp.match(/^(\d+(\.\d+)?)/);
      if (match) {
        return parseFloat(match[1]);
      }
      const asNum = parseFloat(exp);
      return Number.isNaN(asNum) ? 0 : asNum;
    })();

    const preferredLocation = professional.preferedJobLocation || "";
    const candidateQualificationNorm = String(
      professional.highestQualification || ""
    )
      .trim()
      .toLowerCase();

    // ---------- Parallel statistics queries for this candidate ----------
    const [
      interviewStatusAggRaw,
      candidateInterviews,
      jobsAppliedCount,
      pendingInterviewRequestsCount,
      jobMatchesCount,
    ] = await Promise.all([
      // Grouped counts of interview statuses for this candidate
      (async () => {
        const statusQuery = {
          candidateid: candidateId,
          ...(agencyId ? { agencyId } : {}),
        };

        try {
          return await interviewStatus.aggregate([
            { $match: statusQuery },
            {
              $group: {
                _id: "$interviewStatus",
                count: { $sum: 1 },
              },
            },
          ]);
        } catch (err) {
          console.error(
            "getCandidateSelfStatistics: interviewStatus aggregate error",
            err
          );
          return [];
        }
      })(),

      // All interviews scheduled for this candidate (lifetime)
      (async () => {
        const baseQuery = {
          candidateId,
          ...(agencyId ? { agencyId } : {}),
        };

        try {
          let count = await Interviews.countDocuments(baseQuery);

          // If no interviews found, try again with string conversion safeguard
          if (count === 0) {
            const altQuery = {
              candidateId: candidateId.toString(),
              ...(agencyId ? { agencyId } : {}),
            };
            count = await Interviews.countDocuments(altQuery);
          }

          return count;
        } catch (err) {
          console.error(
            "getCandidateSelfStatistics: Interviews.countDocuments error",
            err
          );
          return 0;
        }
      })(),

      // Jobs applied (job applications where this candidate has a jobOpeningId)
      (async () => {
        try {
          return await JobApplication.countDocuments({
            candidateId,
            jobOpeningId: { $exists: true, $ne: null, $ne: "" },
            // If agency scoping is needed later, it can be added here.
          });
        } catch (err) {
          console.error(
            "getCandidateSelfStatistics: JobApplication.countDocuments error",
            err
          );
          return 0;
        }
      })(),

      // Pending interview requests
      (async () => {
        try {
          return await InterviewRequest.countDocuments({
            candidateId,
            ...(agencyId ? { agencyId } : {}),
          });
        } catch (err) {
          console.error(
            "getCandidateSelfStatistics: InterviewRequest.countDocuments error",
            err
          );
          return 0;
        }
      })(),

      // Job matches based on same matching logic used in `candidateJobMatching`
      (async () => {
        // If we don't even know the candidate's job category or industry,
        // we can't reliably compute job matches.
        if (!jobCategoryId && !industriesId) {
          return 0;
        }

        try {
          const jobActiveDays = Number(process.env.JOB_ACTIVE_DAYS) || 30;

          const matchConditions = {
            $and: [
              {
                $expr: {
                  $eq: [
                    {
                      $cond: {
                        if: {
                          $gte: [
                            {
                              $divide: [
                                { $subtract: [new Date(), "$hotvacancy"] },
                                24 * 60 * 60 * 1000 * jobActiveDays,
                              ],
                            },
                            jobActiveDays,
                          ],
                        },
                        then: "Inactive",
                        else: "Active",
                      },
                    },
                    "Active",
                  ],
                },
              },
            ],
          };

          // Industry and category matching (core requirements)
          if (jobCategoryId) {
            matchConditions.$and.push({ jobCategoryId });
          }
          if (industriesId) {
            matchConditions.$and.push({ industriesId });
          }
          matchConditions.$and.push({ postingStatus: "published" });

          const result = await JobOpening.aggregate([
            {
              $addFields: {
                status: {
                  $cond: {
                    if: {
                      $gte: [
                        {
                          $divide: [
                            { $subtract: [new Date(), "$hotvacancy"] },
                            24 * 60 * 60 * 1000 * jobActiveDays,
                          ],
                        },
                        jobActiveDays,
                      ],
                    },
                    then: "Inactive",
                    else: "Active",
                  },
                },
                // Compatibility scoring — no free points for empty job fields
                matchScore: {
                  $add: [
                    // Industry match (30)
                    { $cond: [{ $eq: ["$industriesId", industriesId] }, 30, 0] },
                    // Job category match (30)
                    { $cond: [{ $eq: ["$jobCategoryId", jobCategoryId] }, 30, 0] },
                    // Salary (20) — real range only; 0-0 / empty = 0
                    {
                      $cond: [
                        {
                          $and: [
                            { $gt: [expectedSalary, 0] },
                            {
                              $or: [
                                {
                                  $and: [
                                    { $gt: ["$salaryRangeEnd", 0] },
                                    { $lte: ["$salaryRangeStart", expectedSalary] },
                                    { $gte: ["$salaryRangeEnd", expectedSalary] },
                                  ],
                                },
                                { $eq: ["$negotiable", "yes"] },
                              ],
                            },
                          ],
                        },
                        20,
                        0,
                      ],
                    },
                    // Experience (10) — only if job min experience set
                    {
                      $cond: [
                        {
                          $and: [
                            { $ne: ["$minExperienceYears", null] },
                            { $ne: ["$minExperienceYears", ""] },
                            {
                              $let: {
                                vars: {
                                  minExp: {
                                    $convert: {
                                      input: "$minExperienceYears",
                                      to: "double",
                                      onError: null,
                                      onNull: null,
                                    },
                                  },
                                },
                                in: {
                                  $and: [
                                    { $ne: ["$$minExp", null] },
                                    { $lte: ["$$minExp", candidateExperience] },
                                  ],
                                },
                              },
                            },
                          ],
                        },
                        10,
                        0,
                      ],
                    },
                    // Location (5) — only if both have location
                    {
                      $cond: [
                        {
                          $and: [
                            { $ne: ["$jobLocation", null] },
                            { $ne: ["$jobLocation", ""] },
                            preferredLocation
                              ? {
                                  $regexMatch: {
                                    input: "$jobLocation",
                                    regex: new RegExp(preferredLocation, "i"),
                                  },
                                }
                              : { $literal: false },
                          ],
                        },
                        5,
                        0,
                      ],
                    },
                    // Qualification (5) — only if job qualification set; "any" matches all
                    {
                      $cond: [
                        {
                          $and: [
                            { $ne: ["$qualification", null] },
                            { $ne: ["$qualification", ""] },
                            {
                              $or: [
                                {
                                  $eq: [
                                    { $toLower: { $trim: { input: { $toString: "$qualification" } } } },
                                    "any",
                                  ],
                                },
                                {
                                  $eq: [
                                    {
                                      $toLower: {
                                        $trim: {
                                          input: {
                                            $toString: {
                                              $ifNull: ["$qualification", ""],
                                            },
                                          },
                                        },
                                      },
                                    },
                                    candidateQualificationNorm,
                                  ],
                                },
                              ],
                            },
                          ],
                        },
                        5,
                        0,
                      ],
                    },
                  ],
                },
              },
            },
            { $match: matchConditions },
            { $count: "total" },
          ]);

          return result?.[0]?.total || 0;
        } catch (err) {
          console.error(
            "getCandidateSelfStatistics: job matching aggregate error",
            err
          );
          return 0;
        }
      })(),
    ]);

    const interviewStatusAgg = Array.isArray(interviewStatusAggRaw)
      ? interviewStatusAggRaw
      : [];

    let hired = 0;
    let rejected = 0;
    let completed = 0;
    let available = 0;

    interviewStatusAgg.forEach((row) => {
      if (row._id === "hired") hired = row.count;
      if (row._id === "rejected") rejected = row.count;
      if (row._id === "completed") completed = row.count;
      if (row._id === "available") available = row.count;
    });

    return res.json({
      candidateId,
      profileCompleteness,
      profileCompletenessLabel,
      profileCompletenessBreakdown,
      // Interview flow statistics
      totalInterviews: candidateInterviews,
      interviewsScheduled: candidateInterviews, // Total interviews represent scheduled ones
      interviewsAttended: completed, // Interviews marked as completed
      // Job application flow statistics
      jobsApplied: jobsAppliedCount,
      jobMatches: jobMatchesCount, // Potential matches based on profile
      pendingInterviewRequests: pendingInterviewRequestsCount,
      // Final outcomes
      hired,
      rejected,
      // Additional review statuses (currently unused in response but kept for potential future use)
      // reviewPending: available,
    });
  } catch (error) {
    console.error("getCandidateSelfStatistics: unexpected error", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

/**
 * Candidate login: full interview history for the logged-in candidate only.
 */
exports.getCandidateSelfInterviews = async (req, res) => {
  try {
    const authUser = req.user;
    if (!authUser?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const page = Math.max(1, Number(req.query.page) || 1);
    const perPage = Math.min(100, Math.max(1, Number(req.query.perPage) || 10));
    const skip = (page - 1) * perPage;

    const candidate = await Candidates.findOne({ userId: authUser.id })
      .select("id agencyId")
      .lean();
    if (!candidate?.id) {
      return res.status(404).json({ error: "Candidate profile not found" });
    }

    const match = {
      candidateId: String(candidate.id),
      isdeleted: { $ne: 1 },
    };
    if (candidate.agencyId) {
      match.agencyId = String(candidate.agencyId);
    }

    const pipeline = [
      { $match: match },
      { $sort: { createdAt: -1 } },
      {
        $lookup: {
          from: "clients",
          localField: "onBoardingId",
          foreignField: "id",
          as: "client",
        },
      },
      {
        $lookup: {
          from: "jobOpening",
          localField: "jobOpeningId",
          foreignField: "id",
          as: "jobOpening",
        },
      },
      {
        $lookup: {
          from: "interviewStatus",
          localField: "id",
          foreignField: "interviewId",
          as: "interviewStatusDocs",
          pipeline: [
            { $sort: { interviewStatusUpdate: -1, createdAt: -1 } },
            { $limit: 1 },
          ],
        },
      },
      {
        $lookup: {
          from: "candidates",
          localField: "candidateId",
          foreignField: "id",
          as: "candidateDoc",
        },
      },
      {
        $addFields: {
          client: { $arrayElemAt: ["$client", 0] },
          jobOpening: { $arrayElemAt: ["$jobOpening", 0] },
          interviewStatusDoc: { $arrayElemAt: ["$interviewStatusDocs", 0] },
          candidateDoc: { $arrayElemAt: ["$candidateDoc", 0] },
        },
      },
      {
        $addFields: {
          interviewStatus: {
            $ifNull: [
              "$interviewStatusDoc.interviewStatus",
              {
                $ifNull: ["$candidateDoc.interviewStatus", "scheduled"],
              },
            ],
          },
          companyName: {
            $ifNull: ["$client.companyName", "-"],
          },
          jobTitle: {
            $ifNull: ["$jobOpening.designation", "-"],
          },
        },
      },
      {
        $project: {
          interviewStatusDocs: 0,
          interviewStatusDoc: 0,
          candidateDoc: 0,
        },
      },
      {
        $facet: {
          data: [{ $skip: skip }, { $limit: perPage }],
          count: [{ $count: "total" }],
        },
      },
    ];

    const agg = await Interviews.aggregate(pipeline);
    const results = agg[0]?.data || [];
    const total = agg[0]?.count?.[0]?.total || 0;

    return res.json({
      results,
      total,
      page,
      perPage,
    });
  } catch (error) {
    console.error("getCandidateSelfInterviews error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

exports.createCandidatesCsvFile = async (req, res) => {
  try {
    const agencyId = req.headers["agencyid"] || req?.body?.agencyId;
    const rows = Array.isArray(req.body)
      ? req.body
      : Array.isArray(req.body?.data)
        ? req.body.data
        : [];

    if (!rows.length) {
      return res.json({ error: "No CSV rows received" });
    }

    const created = [];
    const errors = [];

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index] || {};
      const professionalInput =
        row?.professional && typeof row.professional === "object"
          ? row.professional
          : {};
      const email = String(row?.email || "").trim();
      const mobile = String(row?.mobile || "").trim();

      if (!mobile) {
        errors.push(`Row ${index + 2}: mobile is required`);
        continue;
      }

      const existingEmail = email ? await Candidates.findOne({ email }) : null;
      if (existingEmail) {
        errors.push(`Row ${index + 2}: email already exists`);
        continue;
      }

      const existingMobile = mobile
        ? await Candidates.findOne({ mobile })
        : null;
      if (existingMobile) {
        errors.push(`Row ${index + 2}: mobile already exists`);
        continue;
      }

      const objectid = new mongoose.Types.ObjectId();
      const industriesIdsRaw = Array.isArray(row?.industries_relation)
        ? row.industries_relation.map((item) => item?.industriesId)
        : String(row?.industriesId || "")
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean);

      const industries_relation = [];
      for (let i = 0; i < industriesIdsRaw.length; i += 1) {
        const industriesId = String(industriesIdsRaw[i] || "").trim();
        if (!industriesId) continue;
        const industriesDoc = await Industries.findOne({ id: industriesId });
        const relId = new mongoose.Types.ObjectId();
        industries_relation.push({
          id: relId,
          _id: relId,
          createdAt: new Date(),
          cId: objectid,
          industriesId,
          industries: industriesDoc || undefined,
        });
      }

      const professional = await resolveProfessionalJobCategory(professionalInput, {
        experience: parseJsonArray(row?.experience),
        skill: professionalInput?.skill,
        industry: row?.industry,
      });

      const payload = {
        id: objectid,
        _id: objectid,
        agencyId,
        firstname: row?.firstname || "",
        lastname: row?.lastname || "",
        email,
        mobile,
        street: row?.street || "",
        area: row?.area || "",
        city: row?.city || "",
        state: row?.state || "",
        zip: row?.zip || "",
        alternateMobile: row?.alternateMobile || "",
        comments: row?.comments || "",
        gender: row?.gender || "",
        image: row?.image || "",
        resume: row?.resume || "",
        professional,
        industries_relation,
      };

      const candidate = await Candidates.create(payload);
      created.push(candidate);
    }

    if (!created.length) {
      return res.json({ error: errors[0] || "No candidates imported", errors });
    }

    res.json({
      msg: "success",
      createdCount: created.length,
      skippedCount: errors.length,
      errors,
    });
  } catch (err) {
    console.info("candidate create err =>", err);
    res.json({
      error: err?.message || "CSV import failed",
      columns: err?.columns,
      constraint: err?.constraint,
    });
  }
};

exports.createCandidates = async (req, res) => {
  const agencyId = req.headers["agencyid"] || req?.body?.agencyId;
  let { professional, industries_relation, ...data } = req.body;
  try {
    if (!data.mobile) {
      return res.status(400).json({ error: "Mobile number is required" });
    }
    // Keep candidate + login user mobile as 10 digits (Users schema maxlength: 10)
    const normalizedMobile = normalizeIndianMobile(data.mobile);
    if (normalizedMobile.length !== 10) {
      return res.status(400).json({ error: "Please enter a valid 10-digit mobile number" });
    }
    data.mobile = normalizedMobile;
    if (data.alternateMobile) {
      const alt = normalizeIndianMobile(data.alternateMobile);
      data.alternateMobile = alt.length === 10 ? alt : data.alternateMobile;
    }
    const pickExistingCandidate = (doc, matchOn) => {
      if (!doc) return null;
      const obj = typeof doc.toObject === "function" ? doc.toObject() : doc;
      return {
        id: String(obj.id || obj._id || ""),
        firstname: obj.firstname || "",
        lastname: obj.lastname || "",
        mobile: obj.mobile || "",
        email: obj.email || "",
        matchOn,
      };
    };
    const existingCandidateEmail = data.email
      ? await Candidates.findOne({ email: data.email })
      : null;
    if (existingCandidateEmail) {
      return res.json({
        error: "Your email is already in used",
        duplicate: true,
        existingCandidate: pickExistingCandidate(existingCandidateEmail, "email"),
      });
    }
    const existingCandidateMobile = data.mobile
      ? await Candidates.findOne({ mobile: data.mobile })
      : null;
    if (existingCandidateMobile) {
      return res.json({
        error: "Your Mobile number is already in used",
        duplicate: true,
        existingCandidate: pickExistingCandidate(existingCandidateMobile, "mobile"),
      });
    }
    if (req?.files?.image) {
      // let resp = await fileUpload(req.files.image)
      let resp = await awsUploadFiles(req.files.image);
      if (resp?.url) data.image = `${resp.url}`;
    }
    if (req?.files?.resume) {
      let resp = await awsUploadFiles(req.files.resume);
      // let resp = await fileUpload(req.files.resume)
      if (resp?.url) {
        data.resume = `${resp.url}`;
      } else {
        console.error("createCandidates: resume upload failed");
      }
    } else if (
      data.resume === "null" ||
      data.resume === "undefined" ||
      data.resume === "[object Object]"
    ) {
      delete data.resume;
    }
    if (professional) {
      try {
        professional =
          typeof professional === "string"
            ? JSON.parse(professional)
            : professional;
      } catch (e) {
        professional = {};
      }
    }
    if (!professional || typeof professional !== "object") {
      professional = {};
    }
    // Keep salaries on professional even if client sent them at root
    if (professional && typeof professional === "object") {
      if (
        (professional.expectedsalary === undefined ||
          professional.expectedsalary === null ||
          professional.expectedsalary === "") &&
        (data.expectedsalary || data.expectedSalary)
      ) {
        professional.expectedsalary = data.expectedsalary || data.expectedSalary;
      }
      if (
        (professional.currentSalary === undefined ||
          professional.currentSalary === null ||
          professional.currentSalary === "") &&
        data.currentSalary
      ) {
        professional.currentSalary = data.currentSalary;
      }
      professional = syncExpectedSalaryFromCurrent(professional);
    }
    const industriesId = [];
    try {
      if (typeof industries_relation === "string") {
        industries_relation = JSON.parse(industries_relation);
      } else if (req.body.industries_relation) {
        industries_relation =
          typeof req.body.industries_relation === "string"
            ? JSON.parse(req.body.industries_relation)
            : req.body.industries_relation;
      } else {
        industries_relation = [];
      }
    } catch (e) {
      industries_relation = [];
    }
    if (!Array.isArray(industries_relation)) {
      industries_relation = [];
    }
    industries_relation?.filter((ele) => {
      industriesId.push(ele?.industriesId);
    });

    let jobCategoryId = professional?.jobCategoryId;

    professional = await resolveProfessionalJobCategory(professional, {
      experience: parseJsonArray(data.experience || req.body.experience),
      industry: data.industry,
      industries: (industries_relation || [])
        .map(
          (r) => r?.industries?.industryCategory || r?.industryCategory || ""
        )
        .filter(Boolean),
    });
    jobCategoryId = professional?.jobCategoryId;

    // Keep employer/company in sync so listing % matches create form
    if (
      professional.currentEmployer &&
      !professional.currentCompany
    ) {
      professional.currentCompany = professional.currentEmployer;
    } else if (
      professional.currentCompany &&
      !professional.currentEmployer
    ) {
      professional.currentEmployer = professional.currentCompany;
    }

    let objectid = new mongoose.Types.ObjectId();

    // Fetch job opening details if jobOpeningId is provided
    let jobOpening = null;
    if (data.jobOpeningId && data.jobOpeningId !== "null") {
      jobOpening = await JobOpening.findOne({ id: data.jobOpeningId });
    }

    const industries_relationlist = [];
    for (let index = 0; index < industriesId.length; index++) {
      const element = industriesId[index];
      let objectidforloop = new mongoose.Types.ObjectId();
      industries_relationlist.push({
        id: objectidforloop,
        _id: objectidforloop,
        createdAt: new Date(),
        cId: objectid,
        industriesId: element,
        industries: await Industries.findOne({ id: element }),
      });
    }

    const client = await Clients.aggregate([
      {
        $match: {
          agencyId: agencyId,
        },
      },
      {
        $match: {
          $or: [
            {
              "jobCategory_relation.jobCategoryId": jobCategoryId,
            },
            {
              "industries_relation.industriesId": { $in: industriesId },
            },
          ],
          ...(data?.city != null && data.city !== "" ? { $and: [{ city: new RegExp("^" + data.city.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$", "i") }] } : {}), // case-insensitive city match
        },
      },
    ]);

    const agencyEmail = await Agency.aggregate([
      {
        $match: { id: agencyId },
      },
      {
        $project: { email: 1, name: 1, companyowner: 1 },
      },
    ]);
    if (data.interviewerId === "null") delete data.interviewerId;
    if (data.jobOpeningId === "null") delete data.jobOpeningId;

    const candidate = await Candidates.create({
      id: objectid,
      _id: objectid,
      agencyId: agencyId,
      professional: professional,
      industries_relation: industries_relationlist,
      ...data,
    }).then(async (responce) => {
      // Ensure candidate has a corresponding user for login
      try {
        const candidateEmail = responce?.email;
        const candidateMobile = normalizeIndianMobile(responce?.mobile);

        if (candidateEmail) {
          // Find or create "Candidate" role
          let candidateRole = await Role.findOne({ name: "Candidate" });
          if (!candidateRole) {
            throw new Error("Candidate role not found");
          }

          // Candidate login only — not Client user with same email
          let user = await Users.findOne({
            email: candidateEmail,
            agencyId: agencyId,
            roleId: candidateRole.id,
          });

          let plainPasswordForMail = null;

            if (!user) {
            const objectIdUserData = new mongoose.Types.ObjectId();

            // STRICT: Mobile number is the ONLY source for initial password
            plainPasswordForMail = candidateMobile;

            if (!plainPasswordForMail || plainPasswordForMail.length !== 10) {
              throw new Error("Mobile number missing/invalid during user creation");
            }

            const hashedPassword = await bcrypt.hash(plainPasswordForMail, 10);

            const userName =
              `${responce?.firstname || ""} ${responce?.lastname || ""
                }`.trim() || candidateEmail;

            user = await Users.create({
              id: objectIdUserData,
              _id: objectIdUserData,
              roleId: candidateRole?.id,
              name: userName,
              email: candidateEmail,
              password: hashedPassword,
              mobile: candidateMobile,
              agencyId: agencyId,
              isBcrypt: true,
            });
          } else {
            await syncCandidateLoginUser(
              user,
              candidateMobile,
              candidateEmail,
              {
                firstname: responce?.firstname,
                lastname: responce?.lastname,
              }
            );
          }

          // Link candidate to user if not already linked
          if (!responce?.userId && user?.id) {
            await Candidates.updateOne(
              { id: responce.id },
              { $set: { userId: user.id } }
            );
          }

          // Send login credentials email
          if (plainPasswordForMail) {
            await enqueueEmailJob("candidateLoginCredentials", {
              candidate: {
                firstname: responce?.firstname,
                lastname: responce?.lastname,
                email: responce?.email,
              },
              emailTo: responce?.email,
              password: plainPasswordForMail,
            });
          }
        }
      } catch (candidateUserErr) {
        console.info(
          "createCandidates -> candidate user creation error =>",
          candidateUserErr
        );
      }

      // Always trigger Msg API using resume/form mobile — independent of email jobs.
      // Multi-resume upload creates candidates one-by-one, so each create = one API call.
      try {
        const candidateForMsg =
          typeof responce?.toObject === "function"
            ? responce.toObject()
            : responce;
        console.info(
          "Msg API trigger => candidateId:",
          candidateForMsg?.id,
          "mobile:",
          candidateForMsg?.mobile
        );
        sendWelcomeWhatsapp(candidateForMsg, { trigger: "create" })
          .then(async () => {
            // Mark only after all enabled cURL configs have been attempted
            if (candidateForMsg?.id) {
              await Candidates.updateOne(
                { id: candidateForMsg.id },
                { $set: { whatsappMsg: true } }
              );
            }
          })
          .catch((err) => {
            console.info("sendWelcomeWhatsapp error =>", err?.message || err);
          });
      } catch (msgErr) {
        console.info("sendWelcomeWhatsapp trigger error =>", msgErr?.message || msgErr);
      }

      try {
        await enqueueEmailJob("candidateRegistrationSuccess", {
          candidate: responce,
          emailTo: agencyEmail[0]?.email,
          companyName: agencyEmail[0]?.name,
          companyowner: agencyEmail[0]?.companyowner,
        });
      } catch (emailErr) {
        console.info(
          "candidateRegistrationSuccess email error =>",
          emailErr?.message || emailErr
        );
      }

      if (client?.length > 0) {
        try {
          await enqueueEmailJob("bulkCandidatesToClients", {
            clientsEmail: client,
            candidate: responce,
            agencyName: agencyEmail[0]?.name,
            jobTitle: jobOpening?.designation,
          });
        } catch (bulkEmailErr) {
          console.info(
            "bulkCandidatesToClients email error =>",
            bulkEmailErr?.message || bulkEmailErr
          );
        }
      }

      // Applied Candidates page: link new candidate to the job so it shows in applicants list
      if (jobOpening?.id && responce?.id) {
        try {
          const clientWhoPostedJob = await Clients.findOne({
            userId: jobOpening.userId,
          });
          const clientId =
            clientWhoPostedJob?.id || jobOpening.clientId || null;
          if (clientId) {
            const existingApplication = await JobApplication.findOne({
              jobOpeningId: String(jobOpening.id),
              candidateId: String(responce.id),
            });
            if (!existingApplication) {
              const appId = new mongoose.Types.ObjectId();
              await JobApplication.create({
                id: appId,
                _id: appId,
                jobOpeningId: String(jobOpening.id),
                candidateId: String(responce.id),
                clientId: String(clientId),
                status: "applied",
              });
            }
          } else {
            console.error(
              "createCandidates: JobApplication skipped — clientId not found for job",
              jobOpening.id
            );
          }
        } catch (jobAppErr) {
          console.error(
            "createCandidates: JobApplication create failed =>",
            jobAppErr?.message || jobAppErr
          );
        }
      }

      res.send(responce);
    });
  } catch (err) {
    console.log("dataa candidate create errr", err);
    res.json({ columns: err?.columns, constraint: err?.constraint });
  }
};

exports.deleteCandidate = async (req, res) => {
  const idofcandi = req.params.id;
  try {
    const candidate = await Candidates.findOne({ id: idofcandi }).lean();
    if (!candidate) {
      return res.status(404).json({ error: "Candidate not found" });
    }

    await Candidates.deleteOne({ id: idofcandi });

    // Cascade delete related records
    await JobApplication.deleteMany({ candidateId: idofcandi });
    if (ResumeEnquiry) {
      await ResumeEnquiry.deleteMany({ candidateId: idofcandi });
    }
    await InterviewRequest.deleteMany({ candidateId: idofcandi });

    // Remove login user so email/mobile can be reused for client or new candidate
    if (candidate.userId) {
      await Users.deleteOne({ id: candidate.userId });
    } else {
      const candidateRole = await Role.findOne({ name: "Candidate" }).lean();
      const email = String(candidate.email || "").trim().toLowerCase();
      if (candidateRole && candidate.agencyId) {
        const userQuery = { agencyId: candidate.agencyId, roleId: candidateRole.id };
        if (email) {
          await Users.deleteOne({ ...userQuery, email });
        } else if (candidate.mobile) {
          await Users.deleteOne({ ...userQuery, mobile: candidate.mobile });
        }
      }
    }

    res.json({ msg: "success" });
  } catch (error) {
    console.log("delete candidate", error);
    res.json({ msg: "delete candidate err" });
  }
};

exports.candidateUpdate = async (req, res) => {
  let {
    id,
    industries_relation,
    jobOpeningId,
    professional,
    agencyId,
    ...candidate
  } = req.body;

  // express-fileupload can send duplicate keys as arrays
  const pickBodyScalar = (value) => {
    if (Array.isArray(value)) {
      const last = value[value.length - 1];
      return last === undefined || last === null ? "" : last;
    }
    return value;
  };

  if (Array.isArray(id)) id = id[id.length - 1];
  id = String(id || "").trim();
  if (!id) {
    return res.json({ error: "Candidate id is required for update" });
  }

  candidate.email = pickBodyScalar(candidate.email);
  candidate.mobile = pickBodyScalar(candidate.mobile);
  candidate.alternateMobile = pickBodyScalar(candidate.alternateMobile);
  candidate.firstname = pickBodyScalar(candidate.firstname);
  candidate.lastname = pickBodyScalar(candidate.lastname);

  const email = String(candidate.email || "").trim().toLowerCase();
  const mobile = normalizeIndianMobile(candidate.mobile);
  const alternateMobile = normalizeIndianMobile(candidate.alternateMobile);

  // Empty email/mobile must not match other blank records.
  if (email) {
    const existingCandidateEmail = await Candidates.findOne({
      email,
      id: { $ne: id },
    });
    if (existingCandidateEmail) {
      return res.json({
        error: "Email already used by another candidate",
        constraint: "candidates_email_unique",
      });
    }
    candidate.email = email;
  } else {
    delete candidate.email;
  }

  if (mobile && mobile.length === 10) {
    const existingCandidateMobile = await Candidates.findOne({
      $and: [
        { id: { $ne: id } },
        {
          $or: [
            { mobile },
            { mobile: Number(mobile) },
            { mobile: String(mobile) },
          ],
        },
      ],
    });
    if (existingCandidateMobile) {
      return res.json({
        error: "Mobile number already used by another candidate",
        constraint: "candidates_mobile_unique",
      });
    }
    candidate.mobile = mobile;
  } else if (candidate.mobile !== undefined && candidate.mobile !== null && String(candidate.mobile).trim() !== "") {
    return res.json({
      error: "Please enter a valid 10-digit mobile number",
    });
  } else {
    delete candidate.mobile;
  }

  if (alternateMobile && alternateMobile.length === 10) {
    candidate.alternateMobile = alternateMobile;
  }

  if (candidate?.interviewerId == "null") {
    delete candidate?.interviewerId;
  }
  if (candidate?.jobOpeningId == "null") {
    delete candidate?.jobOpeningId;
  }

  if (req?.files?.image) {
    let resp = await awsUploadFiles(req?.files?.image);
    if (resp?.success && resp?.url) {
      candidate.image = `${resp.url}`;
    }
  }
  if (req?.files?.resume) {
    let resp = await awsUploadFiles(req?.files?.resume);
    // let resp = await fileUpload(req.files.resume)
    if (resp?.success && resp?.url) {
      candidate.resume = `${resp.url}`;
    }
  }

  // Security: Prevent password leakage into Candidates collection
  if (candidate.password) delete candidate.password;
  // Candidate profile updates must never toggle whatsapp delivery flags.
  if (Object.prototype.hasOwnProperty.call(candidate, "whatsappMsg")) {
    delete candidate.whatsappMsg;
  }

  delete candidate._id;
  delete candidate.interviews;
  delete candidate.client;
  delete candidate.jobCategory;
  delete candidate.industries;
  delete candidate.agency;
  delete candidate.appliedStatus;
  delete candidate.matchScore;

  try {
    const existingDoc = await Candidates.findOne({ id }).lean();

    if (typeof req.body.professional === "string" && req.body.professional) {
      professional = JSON.parse(req.body.professional);
    } else if (professional && typeof professional === "object") {
      // already an object
    } else {
      professional = null;
    }

    if (professional && hasMeaningfulUpdateValue(professional)) {
      const incomingProfessional = professional;
      professional = mergeUpdatePreserveExisting(
        existingDoc?.professional,
        professional
      );
      // Allow clearing subcategory when category changed / user cleared it
      const incomingCat = String(
        incomingProfessional?.jobCategoryId ||
          incomingProfessional?.jobCategory?.id ||
          ""
      ).trim();
      const existingCat = String(
        existingDoc?.professional?.jobCategoryId ||
          existingDoc?.professional?.jobCategory?.id ||
          ""
      ).trim();
      const incomingSubRaw = incomingProfessional?.jobSubCategoryId;
      const incomingSubCleared =
        incomingSubRaw === "" ||
        incomingSubRaw === null ||
        incomingSubRaw === undefined ||
        (typeof incomingSubRaw === "string" && !incomingSubRaw.trim());
      if (
        incomingCat &&
        existingCat &&
        incomingCat !== existingCat &&
        incomingSubCleared
      ) {
        delete professional.jobSubCategoryId;
        delete professional.jobSubCategory;
      } else if (
        Object.prototype.hasOwnProperty.call(
          incomingProfessional || {},
          "jobSubCategoryId"
        ) &&
        incomingSubCleared
      ) {
        delete professional.jobSubCategoryId;
        delete professional.jobSubCategory;
      }
    } else {
      professional = null;
    }

    for (const key of Object.keys(candidate)) {
      if (!hasMeaningfulUpdateValue(candidate[key])) {
        delete candidate[key];
      }
    }

    // FormData sends JSON arrays as strings — parse so edit saves properly
    for (const arrKey of ["education", "experience"]) {
      if (typeof candidate[arrKey] === "string") {
        const parsed = parseJsonArray(candidate[arrKey]);
        if (parsed.length > 0) candidate[arrKey] = parsed;
        else delete candidate[arrKey];
      } else if (
        candidate[arrKey] === "[object Object]" ||
        (typeof candidate[arrKey] === "string" &&
          candidate[arrKey].includes("[object Object]"))
      ) {
        delete candidate[arrKey];
      }
    }

    let parsedIndustriesRelation = [];
    if (typeof industries_relation === "string" && industries_relation.trim()) {
      try {
        parsedIndustriesRelation = JSON.parse(industries_relation);
      } catch (e) {
        parsedIndustriesRelation = [];
      }
    } else if (Array.isArray(industries_relation)) {
      parsedIndustriesRelation = industries_relation;
    }

    if (professional) {
    professional = await resolveProfessionalJobCategory(professional, {
      experience: parseJsonArray(
        req.body.experience || candidate.experience
      ),
      industry: candidate.industry || req.body.industry,
    });
    professional = syncExpectedSalaryFromCurrent(professional);
    if (
      professional.currentEmployer &&
      !professional.currentCompany
    ) {
      professional.currentCompany = professional.currentEmployer;
    } else if (
      professional.currentCompany &&
      !professional.currentEmployer
    ) {
      professional.currentEmployer = professional.currentCompany;
    }
    }
    if (parsedIndustriesRelation.length > 0) {
      let industriesIdlist = parsedIndustriesRelation.map(
        (item) => item?.industriesId
      );
      const industries_relationlist = [];
      for (let index = 0; index < industriesIdlist.length; index++) {
        const element = industriesIdlist[index];
        let objectid = new mongoose.Types.ObjectId();
        industries_relationlist.push({
          id: objectid,
          createdAt: new Date(),
          cId: id,
          industriesId: element,
          industries: await Industries.findOne({ id: element }),
        });
      }

      const updatePayload = {
        industries_relation: industries_relationlist,
        ...candidate,
      };
      if (professional) updatePayload.professional = professional;

      await Candidates.updateOne(
        { id: id },
        {
          $set: { ...updatePayload, updatedAt: new Date(), whatsappMsg: true },
        }
      );
    } else {
      const updatePayload = { ...candidate };
      if (professional) updatePayload.professional = professional;

      await Candidates.updateOne(
        { id: id },
        {
          $set: { ...updatePayload, updatedAt: new Date(), whatsappMsg: true },
        }
      );
    }

    // HARD RULE: never call sendWelcomeWhatsapp / Msg API on profile edit.
    // Live used to run "Msg API trigger (update)" here — that must stay removed.
    // Both cURL configs (API 1 + API 2) are create-only.
    console.info(
      "candidateUpdate: Msg API skipped (create-only). candidateId:",
      id
    );

    const updatedCandidate = await Candidates.findOne({ id }).lean();
    // Email/mobile edit must keep Users login credentials in sync
    try {
      await ensureCandidateLoginUser(updatedCandidate);
    } catch (loginSyncErr) {
      console.error(
        "candidateUpdate -> ensureCandidateLoginUser error =>",
        loginSyncErr?.message || loginSyncErr
      );
    }

    res.json({
      msg: "success",
      msgApiTriggered: false,
      msgApiPolicy: "create_only",
    });
  } catch (err) {
    console.log("candidate update", err);
    res.json({
      error: err?.message || "Update failed",
      columns: err?.columns,
      constraint: err?.constraint,
    });
  }
};

// Filter Data
exports.getCandidates = async (req, res) => {
  let { page, perPage } = req.query;
  page -= 1;
  const basicDetails = req.body;
  const agencyId = req.headers["agencyid"];
  const userId2 = req.headers.userid;
  const date = new Date(moment().format("YYYY-MM-DD HH:mm:ss"));

  try {
    const profileCompletionFilter =
      basicDetails?.profileCompletion ||
      basicDetails?.profileCompletenessFilter ||
      null;
    delete basicDetails?.profileCompletion;
    delete basicDetails?.profileCompletenessFilter;

    const quickFilter = basicDetails?.quickFilter || null;
    delete basicDetails?.quickFilter;
    // Defensive: never treat meta keys as candidate field filters
    delete basicDetails?.quickFilter;

    // Drawer + quick-tab status filters must run AFTER interviewStatus lookup
    const drawerInterviewStatusRaw = basicDetails?.interviewStatus || null;
    const drawerInterviewStatus =
      typeof drawerInterviewStatusRaw === "string"
        ? drawerInterviewStatusRaw.trim()
        : drawerInterviewStatusRaw;
    delete basicDetails?.interviewStatus;

    // Status tabs are applied after interviewStatus lookup (not on stale document field)
    if (quickFilterNeedsStatusStages(quickFilter)) {
      delete basicDetails?.interviewStatus;
    }

    const commentsKeyword =
      typeof basicDetails?.comments === "string" && basicDetails.comments.trim()
        ? basicDetails.comments.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        : null;
    delete basicDetails?.comments;

    // Dashboard Statistics year/month redirect filters (candidate createdAt)
    let statsYear = basicDetails?.statsYear
      ? Number(basicDetails.statsYear)
      : 0;
    let statsMonth = basicDetails?.statsMonth
      ? Number(basicDetails.statsMonth)
      : 0;
    delete basicDetails?.statsYear;
    delete basicDetails?.statsMonth;

    let statsDateMatch = {};
    if (statsYear || statsMonth) {
      let from;
      let to;
      if (!statsYear) {
        statsYear = new Date().getFullYear();
      }
      if (!statsMonth) {
        from = new Date(`${statsYear}-01-01`);
        to = new Date(`${statsYear}-12-31T23:59:59.999`);
      } else {
        from = new Date(statsYear, statsMonth - 1, 1);
        to = new Date(statsYear, statsMonth, 0, 23, 59, 59, 999);
      }
      statsDateMatch = {
        createdAt: { $gte: from, $lte: to },
      };
    }

    const quickFilterEarlyMatch = getQuickFilterEarlyMatch(quickFilter);

    let industriesId = [];
    let jobCategoryId = [];
    if (basicDetails?.industries) {
      industriesId = basicDetails.industries;
    }
    let filterJobCategoryId = [];
    const candidateDetails = [
      "firstname",
      "lastname",
      "email",
      "mobile",
      "city",
      "cityId",
      "state",
      "stateId",
    ];
    const textField = [
      "noticePeriod",
      "course",
      "field",
      // "preferedJobLocation",
      "english",
      "currentlyWorking",
      "designation",
      "highestQualification",
      "expectedsalary",
      "experienceInyear",
      "currentSalary",
    ];
    let select = [];

    if (basicDetails?.filterJobCategoryId) {
      filterJobCategoryId = basicDetails?.filterJobCategoryId;
      delete basicDetails?.filterJobCategoryId;
    }
    if (basicDetails?.industriesId || basicDetails?.userId) {
      select = [
        "id",
        "firstname",
        "lastname",
        "gender",
        "street",
        "city",
        "interviewStatus",
        "status",
        "created_at",
        "resume",
      ];
    }
    if (
      basicDetails?.jobCategoryId?.length > 0 &&
      filterJobCategoryId.length === 0
    ) {
      jobCategoryId = basicDetails.jobCategoryId;
    }
    delete basicDetails?.industries;
    delete basicDetails?.jobCategoryId;

    let filter = {};
    let filterForProfessional = {};
    let preferedJobLocation = {};
    let dataMergePermissionobj = {};
    let filterforagency = {};
    let citiesfilter = {};
    if (basicDetails.dataMergePermission) {
      dataMergePermissionobj = basicDetails?.dataMergePermission;
    }
    delete basicDetails.dataMergePermission;
    let cities = [];
    const agencydiv = await Agency.findOne({
      id: agencyId,
    });
    agencydiv?.permission?.areas?.map((item) => {
      item?.cities.map((ele) => {
        if (ele.city) {
          cities.push(ele?.city);
        }
      });
    });

    const uniqueworld = await Agency.findOne({
      email: "uniqueworldjobs@gmail.com",
    });
    if (agencyId !== uniqueworld.id) {
      if (
        agencydiv?.permission?.dataMerge?.allAgency == true &&
        agencydiv?.permission?.dataMerge?.allAgency == true
      ) {
        filterforagency = {
          ...filterforagency,
          $or: [
            { "agency.permission.dataMerge.allAgency": true },
            { "agency.id": agencydiv.id },
          ],
        };
      } else if (
        agencydiv?.permission?.dataMerge?.uniqueworld == true &&
        agencydiv?.permission?.dataMerge?.allAgency == false
      ) {
        filterforagency = {
          ...filterforagency,
          $or: [{ "agency.id": agencyId }, { "agency.id": uniqueworld.id }],
        };
      } else if (
        agencydiv?.permission?.dataMerge?.allAgency == false &&
        agencydiv?.permission?.dataMerge?.allAgency == false
      ) {
        filterforagency = {
          ...filterforagency,
          "agency.id": agencyId,
        };
      }
    }
    let pipelineCandidate = [];
    if (uniqueworld.id !== agencyId) {
      pipelineCandidate.push(
        {
          $match: {
            $expr: {
              $cond: {
                if: { $ne: ["$agencyId", agencyId] },
                then: {
                  $in: [
                    "$city",
                    {
                      $map: {
                        input: {
                          $filter: {
                            input: cities,
                            as: "city",
                            cond: {
                              $regexMatch: {
                                input: "$city",
                                regex: "$$city",
                                options: "i",
                              },
                            },
                          },
                        },
                        in: "$$this",
                      },
                    },
                  ],
                },
                else: true,
              },
            },
          },
        },
        {
          $match: { ...filterforagency },
        }
      );
    }
    for (const key in basicDetails) {
      if (key === "quickFilter" || key === "userId") {
        continue;
      }
      if (candidateDetails.includes(key)) {
        filter = {
          ...filter,
          [key]: { $regex: new RegExp(basicDetails[key], "i") },
        };
      } else if (textField.includes(key)) {
        const str = "professional." + key;
        // Free-text professional fields: partial, case-insensitive match
        if (key === "designation" || key === "course" || key === "field") {
          filterForProfessional = {
            ...filterForProfessional,
            [str]: { $regex: new RegExp(basicDetails[key], "i") },
          };
        } else {
          filterForProfessional = {
            ...filterForProfessional,
            [str]: basicDetails[key],
          };
        }
      } else if (key == "state") {
        filter = {
          ...filter,
          [key]: { $regex: new RegExp(basicDetails[key], "i") },
        };
      } else if (key == "gender") {
        filter = {
          ...filter,
          [key]: basicDetails[key],
        };
      } else if (key === "salaryRangeEnd" || key === "salaryRangeStart") {
        filter = {
          ...filter,
          "professional.expectedsalary": {
            $gte: Number(basicDetails["salaryRangeStart"]),
            $lte: Number(basicDetails["salaryRangeEnd"]),
          },
        };
      } else if (key == "preferedJobLocation") {
        preferedJobLocation = {
          ...preferedJobLocation,
          "professional.preferedJobLocation": {
            $regex: new RegExp(basicDetails[key], "i"),
          },
        };
      } else if (key === "userId" || key === "industriesId") {
        // meta keys — ignore
      } else {
        filter = {
          ...filter,
          [key]: basicDetails[key],
        };
      }
    }
    let jobCategoriesDiv = {};
    if (jobCategoryId.length > 0) {
      jobCategoriesDiv = {
        ...jobCategoriesDiv,
        "professional.jobCategoryId": { $in: jobCategoryId },
      };
    }

    let industriesIdDiv = {};
    if (industriesId.length > 0) {
      industriesIdDiv = {
        ...industriesIdDiv,
        "industries_relation.industriesId": { $in: industriesId },
      };
    }
    const pipeline = [
      {
        $match: {
          ...filterForProfessional,
          ...jobCategoriesDiv,
          ...preferedJobLocation,
          ...filter,
          ...industriesIdDiv,
          ...quickFilterEarlyMatch,
          ...statsDateMatch,
        },
      },
    ];

    const profileCompletionStages = [
      ...buildProfileCompletenessAddFieldsStages(),
    ];
    const profileCompletionMatchStage = getProfileCompletionMatchStage(
      profileCompletionFilter
    );
    if (profileCompletionMatchStage) {
      profileCompletionStages.push(profileCompletionMatchStage);
    }

    const viewAndStatusStages = getCandidateViewStatusStages(
      quickFilter,
      userId2,
      agencyId,
      date
    );

    // Resolve real interviewStatus before pagination for status tabs OR drawer filter
    const interviewStatusStages = getInterviewStatusStages(
      agencyId,
      quickFilter
    );
    if (drawerInterviewStatus) {
      const escapedDrawerStatus = String(drawerInterviewStatus).replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
      );
      interviewStatusStages.push({
        $match: {
          interviewStatus: {
            $regex: new RegExp(`^${escapedDrawerStatus}$`, "i"),
          },
        },
      });
    }
    const needsStatusFilter =
      quickFilterNeedsStatusStages(quickFilter) || !!drawerInterviewStatus;

    const commentsFilterStages = [];
    if (commentsKeyword) {
      const commentRegex = new RegExp(commentsKeyword, "i");
      commentsFilterStages.push(
        {
          $lookup: {
            from: "recruiterInternalComments",
            localField: "id",
            foreignField: "candidateId",
            as: "_filterInternalComments",
            pipeline: [
              {
                $match: {
                  agencyId: agencyId,
                  isdeleted: 0,
                  comment: { $regex: commentRegex },
                },
              },
              { $limit: 1 },
            ],
          },
        },
        {
          $match: {
            $or: [
              { comments: { $regex: commentRegex } },
              {
                $expr: { $gt: [{ $size: "$_filterInternalComments" }, 0] },
              },
            ],
          },
        },
        {
          $project: { _filterInternalComments: 0 },
        }
      );
    }

    const prePageStages = [
      ...pipelineCandidate,
      ...pipeline,
      ...profileCompletionStages,
      ...viewAndStatusStages,
      ...(needsStatusFilter ? interviewStatusStages : []),
      ...commentsFilterStages,
    ];

    const [candidate, countAgg] = await Promise.all([
      Candidates.aggregate([
      ...prePageStages,
      {
        $sort: {
          status: 1,
          createdAt: -1
        },
      },
      {
        $skip: page * perPage,
      },
      {
        $limit: Number(perPage),
      },
      {
        $lookup: {
          from: "agency",
          localField: "agencyId",
          foreignField: "id",
          as: "agency",
          pipeline: [
            {
              $project: { password: 0 },
            },
          ],
        },
      },
      {
        $addFields: {
          agency: { $arrayElemAt: ["$agency", 0] },
        },
      },
      {
        $lookup: {
          from: "interviews",
          localField: "id",
          foreignField: "candidateId",
          as: "interviews",
          pipeline: [
            {
              $match: { agencyId: agencyId },
            },
            {
              $lookup: {
                from: "users",
                localField: "userId",
                foreignField: "id",
                as: "users",
              },
            },
            {
              $addFields: {
                users: { $arrayElemAt: ["$users", 0] },
              },
            },
          ],
        },
      },
      {
        $addFields: {
          interviews: { $arrayElemAt: ["$interviews", 0] },
        },
      },
      // When status tab already resolved interviewStatus, skip duplicate lookup
      ...(needsStatusFilter
        ? []
        : getInterviewStatusStages(agencyId, null)),
      {
        $lookup: {
          from: "recruiterInternalComments",
          localField: "id",
          foreignField: "candidateId",
          as: "latestInternalComment",
          pipeline: [
            {
              $match: {
                agencyId: agencyId,
                isdeleted: 0,
              },
            },
            { $sort: { createdAt: -1 } },
            { $limit: 1 },
            {
              $project: {
                comment: 1,
                authorName: 1,
                userId: 1,
                createdAt: 1,
                updatedAt: 1,
              },
            },
          ],
        },
      },
      {
        $addFields: {
          latestInternalComment: {
            $arrayElemAt: ["$latestInternalComment", 0],
          },
        },
      },
      {
        $unset: "professional.jobCategory.updatedAt",
      },
      {
        $unset: "professional.updatedAt",
      },
      {
        $unset: "updatedAt",
      },
      {
        $lookup: {
          from: "savedCandidates",
          let: { cid: { $toString: "$id" } },
          pipeline: [
            {
              $match: {
                $expr: {
                  $eq: [{ $toString: "$candidateId" }, "$$cid"],
                },
                userId: String(userId2),
              },
            },
            { $limit: 1 },
          ],
          as: "savedCandidates",
        },
      },
      {
        $addFields: {
          savedCandidates: { $arrayElemAt: ["$savedCandidates", 0] },
        },
      },
      {
        $project: { viewCandidates: 0 },
      },
    ]),
      Candidates.aggregate([
        ...prePageStages,
        { $count: "total" },
      ]),
    ]);

    const filteredTotal = countAgg?.[0]?.total ?? 0;

    const result = {
      data: candidate,
      count: filteredTotal,
    };
    res.json({
      results: result.data,
      total: result.count,
    });
  } catch (error) {
    console.log("Candidate Filter", error);
    return res.status(500).json({
      results: [],
      total: 0,
      error: error?.message || "Candidate filter failed",
    });
  }
};

//candidate view update
exports.candidateView = async (req, res) => {
  const id = req.params.id;
  const agencyId = req.headers["agencyid"];
  const userId2 = req.headers.userid;
  const findViewd = await viewCandidates.findOne({
    // userId: { $in: [userId2] },
    agencyId: agencyId,
    candidateid: id,
  });
  const findAlreadyviewed = await viewCandidates.findOne({
    agencyId: agencyId,
    candidateid: id,
    userId: { $in: [userId2] },
  });
  if (findAlreadyviewed) {
    res.send({ msg: "success", msg2: "Already viewed" });
  } else if (findViewd) {
    await viewCandidates
      .updateOne({ id: findViewd.id }, { $push: { userId: userId2 } })
      .then(() => res.json({ msg: "success" }));
  } else {
    const objectid = new mongoose.Types.ObjectId();
    await viewCandidates
      .create({
        id: objectid,
        _id: objectid,
        candidateid: id,
        agencyId: agencyId,
        userId: [String(userId2)],
      })
      // await Candidates.updateOne({ id }, { status: "view" })
      .then(() => res.json({ msg: "success" }));
  }
};

exports.checkCandidate = async (req, res) => {
  const { mobile, email } = req.body;
  try {
    const pickExistingCandidate = (doc, matchOn) => {
      if (!doc) return null;
      const obj = typeof doc.toObject === "function" ? doc.toObject() : doc;
      return {
        id: String(obj.id || obj._id || ""),
        firstname: obj.firstname || "",
        lastname: obj.lastname || "",
        mobile: obj.mobile || "",
        email: obj.email || "",
        matchOn,
      };
    };
    const mobileData = mobile ? await Candidates.findOne({ mobile: mobile }) : null;
    const emailData = email ? await Candidates.findOne({ email: email }) : null;

    if (emailData) {
      return res.json({
        msg: "Already registered",
        duplicate: true,
        existingCandidate: pickExistingCandidate(emailData, "email"),
        error: "Your email is already in used",
      });
    }
    if (mobileData) {
      return res.json({
        msg: "Already registered",
        duplicate: true,
        existingCandidate: pickExistingCandidate(mobileData, "mobile"),
        error: "Your Mobile number is already in used",
      });
    }
    return res.json({ msg: false, duplicate: false });
  } catch (err) {
    console.info("----------------------------");
    console.info(" check Candidate err =>", err);
    console.info("----------------------------");
    return res.status(500).json({ error: "Internal server error" });
  }
};

/** Public: load candidate for registration/edit form (?cid=) — scoped by agency slug */
exports.getPublicCandidateForApply = async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    const slug = String(req.query.slug || "").trim();
    if (!id) {
      return res.status(400).json({ error: "Candidate id required" });
    }
    const doc = await Candidates.findOne({ id }).lean();
    if (!doc) {
      return res.status(404).json({ error: "Candidate not found" });
    }
    if (slug) {
      const agencyDoc = await Agency.findOne({ slug }).select("id slug").lean();
      if (!agencyDoc || String(agencyDoc.id) !== String(doc.agencyId)) {
        return res.status(404).json({ error: "Candidate not found" });
      }
    }
    return res.json({ msg: "success", data: doc });
  } catch (err) {
    console.info("getPublicCandidateForApply error =>", err?.message || err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

exports.hiredCandidateforClients = async (req, res) => {
  // const onBoardingId = req?.query?.id;
  const clientId = req?.query?.id;
  const agencyId = req.headers["agencyid"];
  let { page, perPage } = req.query;
  page -= 1;

  const candidate = await interviewStatus.aggregate([
    {
      $match: { agencyId: agencyId },
    },
    {
      $match: { ClientId: clientId },
    },
    {
      $match: { interviewStatus: "hired" },
    },
    {
      $lookup: {
        from: "candidates",
        localField: "candidateid",
        foreignField: "id",
        as: "candidates",
      },
    },
    {
      $addFields: {
        candidates: { $arrayElemAt: ["$candidates", 0] },
      },
    },
    {
      $facet: {
        data: [
          {
            $skip: page * perPage,
          },
          {
            $limit: Number(perPage),
          },
        ],
        count: [{ $group: { _id: null, count: { $sum: 1 } } }],
      },
    },
  ]);
  const result = {
    data: candidate[0].data,
    count: candidate[0].count[0] ? candidate[0].count[0].count : 0,
  };
  try {
    res.json({
      results: result.data,
      total: result.count,
    });
  } catch (error) {
    console.log("Candidate hired Filter", error);
  }
};
exports.candidatesForClients = async (req, res) => {
  let { page, perPage } = req.query;
  page -= 1;
  const basicDetails = req.body;
  let industriesId = [];
  let select = [];
  if (basicDetails?.industriesId || basicDetails?.userId) {
    select = [
      "firstname",
      "lastname",
      "gender",
      "city",
      "interviewStatus",
      "status",
    ];
    if (basicDetails?.industriesId) {
      industriesId = JSON.parse(basicDetails.industriesId);
    }
  }
  delete basicDetails?.industriesId;
  try {
    const candidate = await Candidates.aggregate([
      {
        $sort: { createdAt: -1 },
      },
      {
        $match: {
          $and: [
            { "candidates.userId": basicDetails?.userId },
            {
              "candidates.interviewStatus": "hired",
            },
          ],
        },
      },
      {
        $skip: page * perPage,
      },
      {
        $limit: Number(perPage),
      },
    ]);
    res.json(candidate);
  } catch (err) {
    console.info("-------------------------------");
    console.info(" industriesWisedCandidates=> ", err);
    console.info("-------------------------------");
  }
};
exports.sendBulkMailToCandidates = async (req, res) => {
  const data = req.body;
  try {
    await enqueueEmailJob("bulkMail", { obj: data });
    res.status(202).json({ msg: "Emails queued" });
  } catch (err) {
    console.info("----------------------------");
    console.info("sendBulkMailToCandidates =>", err);
    console.info("----------------------------");
    res.status(500).json(err);
  }
};

exports.getClientCandidates = async (req, res) => {
  let { page, perPage, isSavedCandidates } = req.query;
  page -= 1;
  const basicDetails = req.body;
  const agencyId = req.headers["agencyid"];
  const userId = req.headers.userid;

  try {
    const profileCompletionFilter =
      basicDetails?.profileCompletion ||
      basicDetails?.profileCompletenessFilter ||
      null;
    delete basicDetails?.profileCompletion;
    delete basicDetails?.profileCompletenessFilter;

    const quickFilter = basicDetails?.quickFilter || null;
    delete basicDetails?.quickFilter;
    if (quickFilterNeedsStatusStages(quickFilter)) {
      delete basicDetails?.interviewStatus;
    }
    if (quickFilter === "favorites") {
      isSavedCandidates = true;
    }
    const quickFilterEarlyMatch = getQuickFilterEarlyMatch(quickFilter);

    let industriesId = [];
    let jobCategoryId = [];
    if (basicDetails?.industriesId?.length > 0) {
      industriesId = basicDetails.industriesId;
    }

    const candidateDetails = [
      "firstname",
      "lastname",
      "email",
      "mobile",
      "city",
      "cityId",
    ];
    const textField = [
      "noticePeriod",
      "course",
      "field",
      // "preferedJobLocation",
      "english",
      "currentlyWorking",
      "designation",
      "highestQualification",
      // "expectedsalary",
      "experienceInyear",
      // "currentSalary",
    ];
    let select = [];
    let filterJobCategoryId = [];
    let filterIndustriesId = [];

    if (basicDetails?.filterJobCategoryId) {
      filterJobCategoryId = basicDetails.filterJobCategoryId;
      delete basicDetails?.filterJobCategoryId;
    }
    if (basicDetails?.industries) {
      filterIndustriesId = basicDetails.industries;
      delete basicDetails?.industries;
    }
    if (basicDetails?.industriesId || basicDetails?.userId) {
      select = [
        "id",
        "firstname",
        "lastname",
        "gender",
        "street",
        "city",
        "interviewStatus",
        "status",
        "created_at",
        "resume",
      ];
    }
    if (basicDetails?.jobCategoryId?.length > 0) {
      jobCategoryId = basicDetails.jobCategoryId;
    }
    delete basicDetails?.industriesId;
    delete basicDetails?.jobCategoryId;
    let filter = {};
    let filterForProfessional = {};
    let preferedJobLocation = {};
    for (const key in basicDetails) {
      if (candidateDetails.includes(key)) {
        filter = {
          ...filter,
          [key]: { $regex: new RegExp(basicDetails[key], "i") },
        };
      } else if (textField.includes(key)) {
        const str = "professional." + key;
        if (key === "designation" || key === "course" || key === "field") {
          filterForProfessional = {
            ...filterForProfessional,
            [str]: { $regex: new RegExp(basicDetails[key], "i") },
          };
        } else {
          filterForProfessional = {
            ...filterForProfessional,
            [str]: basicDetails[key],
          };
        }
      } else if (key == "state") {
        filter = {
          ...filter,
          [key]: { $regex: new RegExp(basicDetails[key], "i") },
        };
      } else if (key == "gender") {
        filter = {
          ...filter,
          [key]: basicDetails[key],
        };
      } else if (key == "preferedJobLocation") {
        preferedJobLocation = {
          ...preferedJobLocation,
          "professional.preferedJobLocation": {
            $regex: new RegExp(basicDetails[key], "i"),
          },
        };
      } else if (key == "interviewStatus") {
        filter = {
          ...filter,
          [key]: basicDetails[key],
        };
      } else if (key === "salaryRangeEnd" || key === "salaryRangeStart") {
        filter = {
          ...filter,
          "professional.expectedsalary": {
            $gte: Number(basicDetails["salaryRangeStart"]),
            $lte: Number(basicDetails["salaryRangeEnd"]),
          },
        };
      }
      // else if (key == "salaryRangeEnd" || key == "salaryRangeStart") {
      //   filter = {
      //     ...filter,
      //     "professional.currentSalary": {
      //       $gte: Number(basicDetails["salaryRangeStart"]),
      //       $lte: Number(basicDetails["salaryRangeEnd"]),
      //     },
      //   };
      // }
    }

    let jobCategoriesFilters = {};

    // if (jobCategoryId.length > 0) {
    //   jobCategoriesFilters = {
    //     ...jobCategoriesFilters,
    //     "professional.jobCategoryId": { $in: jobCategoryId },
    //   };
    // }
    let FilterforJobcategory = {};
    if (filterJobCategoryId.length > 0) {
      FilterforJobcategory = {
        ...FilterforJobcategory,
        "professional.jobCategoryId": { $in: filterJobCategoryId },
      };
    }

    let industriesFilter = {};
    // if (industriesId.length > 0) {
    //   industriesFilter = {
    //     ...industriesFilter,
    //     "industries_relation.industriesId": { $in: industriesId },
    //   };
    // }
    let industriesidFilter = {};
    if (filterIndustriesId.length > 0) {
      industriesidFilter = {
        ...industriesidFilter,
        "industries_relation.industriesId": { $in: filterIndustriesId },
      };
    }
    let filters = {};
    // if (jobCategoryId.length > 0 && industriesId.length > 0) {
    //   filters = { $or: [{ ...jobCategoriesFilters }, { ...industriesFilter }] };
    // } else if (jobCategoryId.length > 0 && industriesId.length == 0) {
    //   filters = { ...jobCategoriesFilters };
    // } else if (jobCategoryId.length == 0 && industriesId.length > 0) {
    //   filters = { ...industriesFilter };
    // }
    let savedCandidatesobj = {};
    let savedCandidatesobj2 = {};

    if (isSavedCandidates == "true" || isSavedCandidates == true) {
      savedCandidatesobj = {
        ...savedCandidatesobj,
        savedCandidates: { $exists: true },
      };
      savedCandidatesobj2 = {
        ...savedCandidatesobj2,
        "savedCandidates.userId": basicDetails?.userId,
      };
      filters = {};
    }
    const user = await Users.findOne({
      id: basicDetails?.userId,
    }).populate("role");
    let ClientsVar = await Clients.aggregate([
      { $match: { email: user?.email } },
      { $match: { agencyId: user?.agencyId } },
    ]);
    const agencydiv = await Agency.findOne({
      id: agencyId,
    });
    const uniqueworld = await Agency.findOne({
      email: "uniqueworldjobs@gmail.com",
    });
    let filterforagency = {};
    if (agencyId !== uniqueworld.id) {
      if (
        agencydiv?.permission?.dataMerge?.allAgency == true &&
        agencydiv?.permission?.dataMerge?.allAgency == true
      ) {
        filterforagency = {
          ...filterforagency,
          $or: [
            { "agency.permission.dataMerge.allAgency": true },
            { "agency.id": agencydiv.id },
          ],
        };
      } else if (
        agencydiv?.permission?.dataMerge?.uniqueworld == true &&
        agencydiv?.permission?.dataMerge?.allAgency == false
      ) {
        filterforagency = {
          ...filterforagency,
          $or: [{ "agency.id": agencyId }, { "agency.id": uniqueworld.id }],
        };
      } else if (
        agencydiv?.permission?.dataMerge?.allAgency == false &&
        agencydiv?.permission?.dataMerge?.allAgency == false
      ) {
        filterforagency = {
          ...filterforagency,
          "agency.id": agencyId,
        };
      }
    }
    let cities = [];
    agencydiv?.permission?.areas?.map((item) => {
      item?.cities.map((ele) => {
        if (ele.city) {
          cities.push(ele?.city);
        }
      });
    });
    let pipelineCandidate = [];
    if (agencyId !== uniqueworld.id) {
      if (agencyId) {
        pipelineCandidate.push(
          {
            $match: {
              $expr: {
                $in: [
                  "$city",
                  {
                    $map: {
                      input: {
                        $filter: {
                          input: cities,
                          as: "city",
                          cond: {
                            $regexMatch: {
                              input: "$city",
                              regex: "$$city",
                              options: "i",
                            },
                          },
                        },
                      },
                      in: "$$this",
                    },
                  },
                ],
              },
            },
          },
          {
            $match: { ...filterforagency },
          }
        );
      }
    }
    const cityRegex = new RegExp(`${user?.city}`, "i");
    const pipelined = [
      {
        $match: savedCandidatesobj2,
      },
      {
        $match: FilterforJobcategory,
      },
      {
        $match: industriesidFilter,
      },
      {
        $match: { city: cityRegex },
      },
      {
        $match: {
          // $or: [{ ...industriesFilter }],
          // $or: [{ ...jobCategoriesFilters }, { ...industriesFilter }],
          ...filterForProfessional,
          ...preferedJobLocation,
          ...filter,
          ...filters,
          ...quickFilterEarlyMatch,
        },
      },
      {
        $lookup: {
          from: "agency",
          localField: "agencyId",
          foreignField: "id",
          as: "agency",
          pipeline: [
            {
              $project: { password: 0 },
            },
          ],
        },
      },
      {
        $addFields: {
          agency: { $arrayElemAt: ["$agency", 0] },
        },
      },
      ...pipelineCandidate,
      {
        $lookup: {
          from: "interviewRequest",
          localField: "id",
          foreignField: "candidateId",
          as: "interviewRequest",
          pipeline: [
            {
              $sort: { createdAt: 1 },
            },
            {
              $match: { clientId: ClientsVar[0]?.id },
            },
          ],
        },
      },
      {
        $addFields: {
          interviewRequest: {
            $map: {
              input: "$interviewRequest",
              as: "request",
              in: {
                $mergeObjects: [
                  "$$request",
                  {
                    days: {
                      $divide: [
                        {
                          $subtract: [new Date(), "$$request.createdAt"],
                        },
                        1000 * 3600 * 24,
                      ],
                    },
                  },
                ],
              },
            },
          },
        },
      },
      {
        $addFields: {
          interviewRequest: {
            $map: {
              input: "$interviewRequest",
              as: "request",
              in: {
                $mergeObjects: [
                  "$$request",
                  {
                    isdisabled: {
                      $lte: [
                        "$$request.days",
                        process.env.INTERVIEW_REQUEST_DURATION,
                      ],
                    },
                  },
                ],
              },
            },
          },
        },
      },
      {
        $addFields: {
          interview_request: { $arrayElemAt: ["$interviewRequest", 0] },
        },
      },
      {
        $project: { interviewRequest: 0 },
      },
    ];

    const profileCompletionStages = [
      ...buildProfileCompletenessAddFieldsStages(),
    ];
    const profileCompletionMatchStage = getProfileCompletionMatchStage(
      profileCompletionFilter
    );
    if (profileCompletionMatchStage) {
      profileCompletionStages.push(profileCompletionMatchStage);
    }

    const clientQuickFilterStages = [
      ...getCandidateViewStatusStages(quickFilter, userId, agencyId),
      ...(quickFilterNeedsStatusStages(quickFilter)
        ? getInterviewStatusStages(agencyId, quickFilter)
        : []),
    ];

    const demo = await Candidates.aggregate([
      {
        $sort: { createdAt: -1 },
      },
      {
        $lookup: {
          from: "savedCandidates",
          localField: "id",
          foreignField: "candidateId",
          as: "savedCandidates",
        },
      },
      {
        $addFields: {
          savedCandidates: { $arrayElemAt: ["$savedCandidates", 0] },
        },
      },
      ...pipelined,
      ...profileCompletionStages,
      ...clientQuickFilterStages,
      ...getClientVisibleCommentsStages(agencyId),
      ...getLatestInternalCommentStages(agencyId, { clientVisibleOnly: true }),
      {
        $skip: page * perPage,
      },
      {
        $limit: Number(perPage),
      },
    ]);

    const count = await Candidates.aggregate([
      {
        $sort: { createdAt: -1 },
      },
      {
        $lookup: {
          from: "savedCandidates",
          localField: "id",
          foreignField: "candidateId",
          as: "savedCandidates",
        },
      },
      {
        $addFields: {
          savedCandidates: { $arrayElemAt: ["$savedCandidates", 0] },
        },
      },
      ...pipelined,
      ...profileCompletionStages,
      ...clientQuickFilterStages,
      {
        $count: "count",
      },
    ]);

    res.json({
      results: demo,
      total: count[0]?.count,
    });
  } catch (error) {
    console.log("Candidate Filter", error);
  }
};
exports.BestMatchClientCandidates = async (req, res) => {
  let { page, perPage, isSavedCandidates } = req.query;
  page -= 1;
  const basicDetails = req.body;
  const agencyId = req.headers["agencyid"];
  const userId = req.headers.userid;

  try {
    const profileCompletionFilter =
      basicDetails?.profileCompletion ||
      basicDetails?.profileCompletenessFilter ||
      null;
    delete basicDetails?.profileCompletion;
    delete basicDetails?.profileCompletenessFilter;

    let industriesId = [];
    let jobCategoryId = [];
    if (basicDetails?.industriesId?.length > 0) {
      industriesId = basicDetails.industriesId;
    }

    const candidateDetails = [
      "firstname",
      "lastname",
      "email",
      "mobile",
      "city",
      "cityId",
    ];
    const textField = [
      "noticePeriod",
      "course",
      "field",
      // "preferedJobLocation",
      "english",
      "currentlyWorking",
      "designation",
      "highestQualification",
      // "expectedsalary",
      "experienceInyear",
      // "currentSalary",
    ];
    let select = [];
    let filterJobCategoryId = [];
    let filterIndustriesId = [];

    if (basicDetails?.filterJobCategoryId) {
      filterJobCategoryId = basicDetails.filterJobCategoryId;
      delete basicDetails?.filterJobCategoryId;
    }
    if (basicDetails?.industries) {
      filterIndustriesId = basicDetails.industries;
      delete basicDetails?.industries;
    }
    if (basicDetails?.industriesId || basicDetails?.userId) {
      select = [
        "id",
        "firstname",
        "lastname",
        "gender",
        "street",
        "city",
        "interviewStatus",
        "status",
        "created_at",
        "resume",
      ];
    }
    if (basicDetails?.jobCategoryId?.length > 0) {
      jobCategoryId = basicDetails.jobCategoryId;
    }
    delete basicDetails?.industriesId;
    delete basicDetails?.jobCategoryId;
    let filter = {};
    let filterForProfessional = {};
    let preferedJobLocation = {};
    for (const key in basicDetails) {
      if (candidateDetails.includes(key)) {
        filter = {
          ...filter,
          [key]: { $regex: new RegExp(basicDetails[key], "i") },
        };
      } else if (textField.includes(key)) {
        const str = "professional." + key;
        if (key === "designation" || key === "course" || key === "field") {
          filterForProfessional = {
            ...filterForProfessional,
            [str]: { $regex: new RegExp(basicDetails[key], "i") },
          };
        } else {
          filterForProfessional = {
            ...filterForProfessional,
            [str]: basicDetails[key],
          };
        }
      } else if (key == "state") {
        filter = {
          ...filter,
          [key]: { $regex: new RegExp(basicDetails[key], "i") },
        };
      } else if (key == "gender") {
        filter = {
          ...filter,
          [key]: basicDetails[key],
        };
      } else if (key == "preferedJobLocation") {
        preferedJobLocation = {
          ...preferedJobLocation,
          "professional.preferedJobLocation": {
            $regex: new RegExp(basicDetails[key], "i"),
          },
        };
      } else if (key == "interviewStatus") {
        filter = {
          ...filter,
          [key]: basicDetails[key],
        };
      } else if (key === "salaryRangeEnd" || key === "salaryRangeStart") {
        filter = {
          ...filter,
          "professional.expectedsalary": {
            $gte: Number(basicDetails["salaryRangeStart"]),
            $lte: Number(basicDetails["salaryRangeEnd"]),
          },
        };
      }
    }
    let jobCategoriesFilters = {};

    if (jobCategoryId.length > 0) {
      jobCategoriesFilters = {
        ...jobCategoriesFilters,
        "professional.jobCategoryId": { $in: jobCategoryId },
      };
    }
    let FilterforJobcategory = {};
    if (filterJobCategoryId.length > 0) {
      FilterforJobcategory = {
        ...FilterforJobcategory,
        "professional.jobCategoryId": { $in: filterJobCategoryId },
      };
    }

    let industriesFilter = {};
    if (industriesId.length > 0) {
      industriesFilter = {
        ...industriesFilter,
        "industries_relation.industriesId": { $in: industriesId },
      };
    }
    let industriesidFilter = {};
    if (filterIndustriesId.length > 0) {
      industriesidFilter = {
        ...industriesidFilter,
        "industries_relation.industriesId": { $in: filterIndustriesId },
      };
    }
    let filters = {};
    if (jobCategoryId.length > 0 && industriesId.length > 0) {
      filters = {
        $and: [{ ...jobCategoriesFilters }, { ...industriesFilter }],
      };
    } else if (jobCategoryId.length > 0 && industriesId.length == 0) {
      filters = { ...jobCategoriesFilters };
    } else if (jobCategoryId.length == 0 && industriesId.length > 0) {
      filters = { ...industriesFilter };
    }
    let savedCandidatesobj = {};
    let savedCandidatesobj2 = {};

    if (isSavedCandidates == "true" || isSavedCandidates == true) {
      savedCandidatesobj = {
        ...savedCandidatesobj,
        savedCandidates: { $exists: true },
      };
      savedCandidatesobj2 = {
        ...savedCandidatesobj2,
        "savedCandidates.userId": basicDetails?.userId,
      };
      filters = {};
    }
    const user = await Users.findOne({
      id: basicDetails?.userId,
    }).populate("role");
    let ClientsVar = await Clients.aggregate([
      { $match: { email: user?.email } },
      { $match: { agencyId: user?.agencyId } },
    ]);
    const agencydiv = await Agency.findOne({
      id: agencyId,
    });
    const uniqueworld = await Agency.findOne({
      email: "uniqueworldjobs@gmail.com",
    });
    let filterforagency = {};
    if (agencyId !== uniqueworld.id) {
      if (
        agencydiv?.permission?.dataMerge?.allAgency == true &&
        agencydiv?.permission?.dataMerge?.allAgency == true
      ) {
        filterforagency = {
          ...filterforagency,
          $or: [
            { "agency.permission.dataMerge.allAgency": true },
            { "agency.id": agencydiv.id },
          ],
        };
      } else if (
        agencydiv?.permission?.dataMerge?.uniqueworld == true &&
        agencydiv?.permission?.dataMerge?.allAgency == false
      ) {
        filterforagency = {
          ...filterforagency,
          $or: [{ "agency.id": agencyId }, { "agency.id": uniqueworld.id }],
        };
      } else if (
        agencydiv?.permission?.dataMerge?.allAgency == false &&
        agencydiv?.permission?.dataMerge?.allAgency == false
      ) {
        filterforagency = {
          ...filterforagency,
          "agency.id": agencyId,
        };
      }
    }
    let cities = [];
    agencydiv?.permission?.areas?.map((item) => {
      item?.cities.map((ele) => {
        if (ele.city) {
          cities.push(ele?.city);
        }
      });
    });
    let pipelineCandidate = [];
    if (agencyId !== uniqueworld.id) {
      if (agencyId) {
        pipelineCandidate.push(
          {
            $match: {
              $expr: {
                $in: [
                  "$city",
                  {
                    $map: {
                      input: {
                        $filter: {
                          input: cities,
                          as: "city",
                          cond: {
                            $regexMatch: {
                              input: "$city",
                              regex: "$$city",
                              options: "i",
                            },
                          },
                        },
                      },
                      in: "$$this",
                    },
                  },
                ],
              },
            },
          },
          {
            $match: { ...filterforagency },
          }
        );
      }
    }
    const cityRegex = new RegExp(`${user?.city}`, "i");
    const pipelined = [
      {
        $match: savedCandidatesobj2,
      },
      {
        $match: FilterforJobcategory,
      },
      {
        $match: industriesidFilter,
      },
      {
        $match: { city: cityRegex },
      },
      {
        $match: {
          // $or: [{ ...industriesFilter }],
          // $or: [{ ...jobCategoriesFilters }, { ...industriesFilter }],
          ...filterForProfessional,
          ...preferedJobLocation,
          ...filter,
          ...filters,
        },
      },
      {
        $lookup: {
          from: "agency",
          localField: "agencyId",
          foreignField: "id",
          as: "agency",
          pipeline: [
            {
              $project: { password: 0 },
            },
          ],
        },
      },
      {
        $addFields: {
          agency: { $arrayElemAt: ["$agency", 0] },
        },
      },
      ...pipelineCandidate,
      {
        $lookup: {
          from: "interviewRequest",
          localField: "id",
          foreignField: "candidateId",
          as: "interviewRequest",
          pipeline: [
            {
              $sort: { createdAt: 1 },
            },
            {
              $match: { clientId: ClientsVar[0]?.id },
            },
          ],
        },
      },
      {
        $addFields: {
          interviewRequest: {
            $map: {
              input: "$interviewRequest",
              as: "request",
              in: {
                $mergeObjects: [
                  "$$request",
                  {
                    days: {
                      $divide: [
                        {
                          $subtract: [new Date(), "$$request.createdAt"],
                        },
                        1000 * 3600 * 24,
                      ],
                    },
                  },
                ],
              },
            },
          },
        },
      },
      {
        $addFields: {
          interviewRequest: {
            $map: {
              input: "$interviewRequest",
              as: "request",
              in: {
                $mergeObjects: [
                  "$$request",
                  {
                    isdisabled: {
                      $lte: [
                        "$$request.days",
                        process.env.INTERVIEW_REQUEST_DURATION,
                      ],
                    },
                  },
                ],
              },
            },
          },
        },
      },
      {
        $addFields: {
          interview_request: { $arrayElemAt: ["$interviewRequest", 0] },
        },
      },
      {
        $project: { interviewRequest: 0 },
      },
    ];

    const profileCompletionStages = [
      ...buildProfileCompletenessAddFieldsStages(),
    ];
    const profileCompletionMatchStage = getProfileCompletionMatchStage(
      profileCompletionFilter
    );
    if (profileCompletionMatchStage) {
      profileCompletionStages.push(profileCompletionMatchStage);
    }

    const demo = await Candidates.aggregate([
      {
        $sort: { createdAt: -1 },
      },
      {
        $lookup: {
          from: "savedCandidates",
          localField: "id",
          foreignField: "candidateId",
          as: "savedCandidates",
        },
      },
      {
        $addFields: {
          savedCandidates: { $arrayElemAt: ["$savedCandidates", 0] },
        },
      },
      ...pipelined,
      ...profileCompletionStages,
      ...getClientVisibleCommentsStages(agencyId),
      ...getLatestInternalCommentStages(agencyId, { clientVisibleOnly: true }),
      {
        $skip: page * perPage,
      },
      {
        $limit: Number(perPage),
      },
    ]);

    const count = await Candidates.aggregate([
      {
        $sort: { createdAt: -1 },
      },
      {
        $lookup: {
          from: "savedCandidates",
          localField: "id",
          foreignField: "candidateId",
          as: "savedCandidates",
        },
      },
      {
        $addFields: {
          savedCandidates: { $arrayElemAt: ["$savedCandidates", 0] },
        },
      },
      ...pipelined,
      ...profileCompletionStages,
      {
        $count: "count",
      },
    ]);

    res.json({
      results: demo,
      total: count[0]?.count,
    });
  } catch (error) {
    console.log("Candidate Filter", error);
  }
};

exports.changeCandidatesDataSructure = async (req, res) => {
  // Candidate
  // try {
  //   const data = await Candidates.aggregate([
  //     {
  //       $sort: { createdAt: -1 },
  //     },
  //     {
  //       $lookup: {
  //         from: "industriesRelation",
  //         localField: "id",
  //         foreignField: "cId",
  //         as: "industries_relation",
  //         pipeline: [
  //           {
  //             $lookup: {
  //               from: "industries",
  //               localField: "industriesId",
  //               foreignField: "id",
  //               as: "industries",
  //             },
  //           },
  //           {
  //             $addFields: {
  //               industries: { $arrayElemAt: ["$industries", 0] },
  //             },
  //           },
  //         ],
  //       },
  //     },
  //     {
  //       $addFields: {
  //         industries_relation: { $arrayElemAt: ["$industries_relation", 0] },
  //       },
  //     },
  //     {
  //       $lookup: {
  //         from: "professional",
  //         localField: "id",
  //         foreignField: "candidateId",
  //         as: "professional",
  //         pipeline: [
  //           {
  //             $lookup: {
  //               from: "jobCategory",
  //               localField: "jobCategoryId",
  //               foreignField: "id",
  //               as: "jobCategory",
  //             },
  //           },
  //           {
  //             $addFields: {
  //               jobCategory: { $arrayElemAt: ["$jobCategory", 0] },
  //             },
  //           },
  //         ],
  //       },
  //     },
  //     {
  //       $addFields: {
  //         professional: { $arrayElemAt: ["$professional", 0] },
  //       },
  //     },
  //     // {
  //     //   $limit: 50,
  //     // },
  //   ]);
  //   res.json({ results: data });
  //   let i = 0;
  //   while (i < data?.length) {
  //     // const item = data[i];
  //     // console.info("-------------------------------");
  //     // console.info("item => ", item);
  //     // console.info("-------------------------------");
  //     // const objectId = new mongoose.Types.ObjectId();
  //     // await Candidates.updateOne(
  //     //   { id: item.id },
  //     //   { $set: { id: objectId, ...item } }
  //     // ).then(() => i++);
  //   }
  // } catch (error) {
  //   res.json(error);
  // }
  //Client
  // const data = await Clients.aggregate([
  //   {
  //     $sort: { createdAt: -1 },
  //   },
  //   {
  //     $lookup: {
  //       from: "industriesRelation",
  //       localField: "id",
  //       foreignField: "cId",
  //       as: "industries_relation",
  //       pipeline: [
  //         {
  //           $lookup: {
  //             from: "industries",
  //             localField: "industriesId",
  //             foreignField: "id",
  //             as: "industries",
  //           },
  //         },
  //         {
  //           $addFields: {
  //             industries: { $arrayElemAt: ["$industries", 0] },
  //           },
  //         },
  //       ],
  //     },
  //   },
  //   {
  //     $addFields: {
  //       industries_relation: { $arrayElemAt: ["$industries_relation", 0] },
  //     },
  //   },
  //   {
  //     $lookup: {
  //       from: "jobCategoryRelation",
  //       localField: "id",
  //       foreignField: "cId",
  //       as: "jobCategory_relation",
  //       pipeline: [
  //         {
  //           $lookup: {
  //             from: "jobCategory",
  //             localField: "jobCategoryId",
  //             foreignField: "id",
  //             as: "jobCategory",
  //           },
  //         },
  //         {
  //           $addFields: {
  //             jobCategory: { $arrayElemAt: ["$jobCategory", 0] },
  //           },
  //         },
  //       ],
  //     },
  //   },
  //   {
  //     $addFields: {
  //       jobCategory_relation: { $arrayElemAt: ["$jobCategory_relation", 0] },
  //     },
  //   },
  //   // {
  //   //   $limit: 50,
  //   // },
  // ]);
  // res.json({ results: data });
  // let i = 0;
  // while (i < data?.length) {
  //   const item = data[i];
  //   console.info("-------------------------------");
  //   console.info("item => ", item);
  //   console.info("-------------------------------");
  //   const objectId = new mongoose.Types.ObjectId();
  //   await Clients.updateOne(
  //     { id: item.id },
  //     { $set: { id: objectId, ...item } }
  //   ).then(() => i++);
  // }
  // Interview Status
  // const data = await Candidates.aggregate([
  //   {
  //     $sort: { createdAt: -1 },
  //   },
  //   {
  //     $lookup: {
  //       from: "interviews",
  //       localField: "id",
  //       foreignField: "candidateId",
  //       as: "interviews",
  //     },
  //   },
  //   {
  //     $unwind: "$interviews",
  //   },
  // {
  //   $addFields: {
  //     interviews: { $arrayElemAt: ["$interviews", 0] },
  //   },
  // },
  // {
  //   $limit: 50,
  // },
  // ]);
  // res.json({ results: data });
  // let i = 0;
  // while (i < data?.length) {
  //   const item = data[i];
  //   console.info("-------------------------------");
  //   console.info("item => ", item);
  //   console.info("-------------------------------");
  //   const objectId = new mongoose.Types.ObjectId();
  //   await interviewStatus
  //     .create({
  //       _id: objectId,
  //       id: objectId,
  //       interviewId: item?.interviews?.id,
  //       candidateid: item?.id,
  //       interviewStatus: item?.interviewStatus,
  //       userId: item?.interviews?.userId,
  //       interviewStatusUpdate: item?.interviewStatusUpdate,
  //       agencyId: "69717d7b-cf0b-49c2-a569-7f7d46adc7ae",
  //     })
  //     .then(() => i++);
  // }
  // client which are in users to have city and state
  // const data = await Clients.aggregate([
  //   {
  //     $sort: { createdAt: -1 },
  //   },
  //   {
  //     $lookup: {
  //       from: "users",
  //       localField: "userId",
  //       foreignField: "id",
  //       as: "users",
  //       pipeline: [
  //         {
  //           $match: {
  //             planId: {
  //               $in: [
  //                 "94791e55-83f7-43f7-95bb-0f6d13ed254d",
  //                 "1182bf42-be12-4327-892a-b4ef4f7af458",
  //               ],
  //             },
  //           },
  //         },
  //       ],
  //     },
  //   },
  //   {
  //     $addFields: {
  //       users: { $arrayElemAt: ["$users", 0] },
  //     },
  //   },
  //   {
  //     $count: "count",
  //   },
  //   // {
  //   //   $limit: 50,
  //   // },
  // ]);
  // res.json({ results: data });
  // let i = 0;
  // while (i < data?.length) {
  //   // const item = data[i];
  //   // console.info("-------------------------------");
  //   // console.info("item => ", item);
  //   // console.info("-------------------------------");
  //   // await Users.updateOne(
  //   //   { id: item.users.id },
  //   //   {
  //   //     $set: { state: item.state, city: item.city },
  //   //   }
  //   // ).then(() => i++);
  // }
  // const data = await Users.aggregate([
  //   {
  //     $lookup: {
  //       from: "subscriptions",
  //       localField: "subscriptionId",
  //       foreignField: "id",
  //       as: "subscriptions",
  //       pipeline: [
  //         {
  //           $match: {
  //             createdAt: {
  //               $gt: new Date("2023-04-30T10:21:55.123+00:00"),
  //             },
  //           },
  //         },
  //         {
  //           $match: {
  //             active_plan: true,
  //           },
  //         },
  //         {
  //           $lookup: {
  //             from: "plans",
  //             localField: "planId",
  //             foreignField: "id",
  //             as: "plans",
  //           },
  //         },
  //         {
  //           $unwind: "$plans",
  //         },
  //         // {
  //         // $match: { "plans.planName": "Enterprises" },
  //         // },
  //         {
  //           $match: {
  //             $or: [
  //               { "plans.planName": "Professionals" },
  //               { "plans.planName": "Enterprises" },
  //             ],
  //           },
  //         },
  //       ],
  //     },
  //   },
  //   {
  //     $unwind: "$subscriptions",
  //   },
  //   // {
  //   //   $addFields: {
  //   //     subscriptions: { $arrayElemAt: ["$subscriptions", 0] },
  //   //   },
  //   // },
  //   // {
  //   //   $count: "count",
  //   // },
  // ]);
  // res.json({ results: data });
  // let i = 0;
  // while (i < data?.length) {
  //   const item = data[i];
  //   console.info("-------------------------------");
  //   console.info("item => ", item);
  //   console.info("-------------------------------");
  //   await Orderofpayments.updateOne(
  //     { id: item?.id },
  //     {
  //       $set: {
  //         // id: objectId,
  //         // tax: "18",
  //         // TotalAmount: 7079,
  //         // zipcode: "null",
  //         // address: item?.address,
  //         // Company: "null",
  //         // lastname: item?.name.split(" ")[0],
  //         // firstname: item?.name.split(" ")[1],
  //         // city: item?.city,
  //         // email: item?.email,
  //         // state: item?.state,
  //         // paymentId: "null",
  //         // redirectUrl: "null",
  //         // gst: "null",
  //         // callbackUrl: "null",
  //         // merchantTransactionId: objectId,
  //         // name: item?.name,
  //         // planId: item?.subscriptions?.planId,
  //         // paymentMethod: "cash",
  //         // pannumber: "",
  //         // price: item?.subscriptions?.plans?.price,
  //         // agencyId: item?.agencyId,
  //         // merchantUserId: item?.userId,
  //         // paymentInstrument: "null",
  //         // redirectMode: "null",
  //         // mobileNumber: item?.mobile,
  //         // response: {
  //         //   success: true,
  //         //   code: "PAYMENT_SUCCESS",
  //         //   message: "Your payment is successful.",
  //         //   data: {
  //         //     merchantId: "PGTESTPAYUAT",
  //         //     merchantTransactionId: objectId,
  //         //     transactionId: "null",
  //         //     amount: 707900,
  //         //     state: "COMPLETED",
  //         //     responseCode: "SUCCESS",
  //         //     paymentInstrument: {
  //         //       type: "cash",
  //         //       cardType: "CREDIT_CARD",
  //         //       pgTransactionId: "PG2207221432267522530776",
  //         //       bankTransactionId: null,
  //         //       pgAuthorizationCode: null,
  //         //       arn: null,
  //         //       bankId: null,
  //         //       brn: "B12345",
  //         //     },
  //         //   },
  //         // },
  //         invoicenumber: i + 1,
  //       },
  //     }
  //   ).then(() => i++);
  // }
};
/**
 *  🎯 MATCHING CRITERIA & SCORING (100-point scale):
 * - Industry Match: 30 points (exact industry match)
 * - Job Category Match: 30 points (exact job category match)  
 * - Salary Compatibility: 20 points (within range or negotiable)
 * - Experience Requirements: 10 points (meets minimum experience)
 * - Location Preference: 5 points (fuzzy location matching)
 * - Work Type Compatibility: 5 points (matches work type if specified)
 * 
 * 📊 FILTERING FEATURES:
 * - Only active jobs (posted within last 30 days)
 * - Salary range matching with negotiable option
 * - Experience requirement validation
 * - Geographic location compatibility
 * - Work type alignment
 * 
 * 🔄 SORTING PRIORITY:
 * 1. Match Score (highest compatibility first)
 * 2. Job Recency (newest postings first)
 * 3. Creation Date (most recent first)
 * 
 * Get matching jobs for candidate based on their industry and job category
 * @param {Object} req - Request object with userId
 * @param {Object} res - Response object
 */
exports.candidateJobMatching = async (req, res) => {
  try {
    let { userId, page, perPage } = req.body;
    page = parseInt(page) || 1;
    perPage = parseInt(perPage) || 20;
    if (!userId) {
      return res.status(400).json({ msg: "userId is required" });
    }
    if (!page || !perPage) {
      return res.status(400).json({ msg: "Page and perPage are required" });
    }
    const candidateData = await Candidates.findOne({ userId: userId });
    if (!candidateData) {
      return res.status(404).json({ msg: "Candidate not found" });
    }
    const candidateId = candidateData.id;
    const jobCategoryId = candidateData?.professional?.jobCategoryId;
    const industriesId = candidateData?.industries_relation?.[0]?.industriesId;
    // Extract candidate professional details for matching
    const candidatePro = candidateData.professional || {};
    const expectedSalary = candidatePro.expectedsalary || 0;
    const candidateExperience = (() => {
      const exp = candidatePro.experienceInyear;
      // Handle formats like "0-1 year" or "3.5"
      if (!exp || typeof exp !== "string") return 0;
      // Attempt to extract number from start of string (e.g. "0-1 year" => 0)
      const match = exp.match(/^(\d+(\.\d+)?)/);
      if (match) {
        return parseFloat(match[1]);
      }
      // fallback for just number string
      const asNum = parseFloat(exp);
      return isNaN(asNum) ? 0 : asNum;
    })();
    const preferredLocation = candidatePro.preferedJobLocation || "";
    const candidateSkills = candidatePro.skill || "";
    const candidateQualifications = candidatePro.highestQualification || "";

    // Build professional match conditions with scoring system
    const matchConditions = {
      $and: [
        {
          $expr: {
            $eq: [
              {
                $cond: {
                  if: {
                    $gte: [
                      {
                        $divide: [
                          { $subtract: [new Date(), "$hotvacancy"] },
                          24 * 60 * 60 * 1000 * process.env.JOB_ACTIVE_DAYS || 30// 30 days in milliseconds
                        ]
                      },
                      process.env.JOB_ACTIVE_DAYS || 30 // Job is active if posted within 30 days
                    ]
                  },
                  then: "Inactive",
                  else: "Active"
                }
              },
              "Active"
            ]
          }
        }
      ]
    };

    // Industry and category matching (core requirements)
    if (jobCategoryId) {
      matchConditions.$and.push({ jobCategoryId: jobCategoryId });
    }
    // Show active jobs visible to candidates (open + published; hide draft/closed/archived)
    matchConditions.$and.push({
      postingStatus: { $in: ["open", "published"] },
    });
    // if (industriesId) {
    //   matchConditions.$and.push({ industriesId: industriesId });
    // }

    // Find matching job openings with scoring
    const matchingJobs = await JobOpening.aggregate([
      {
        $addFields: {
          status: {
            $cond: {
              if: {
                $gte: [
                  {
                    $divide: [
                      { $subtract: [new Date(), "$hotvacancy"] },
                      24 * 60 * 60 * 1000 * process.env.JOB_ACTIVE_DAYS || 30// 30 days in milliseconds
                    ]
                  },
                  process.env.JOB_ACTIVE_DAYS || 30
                ]
              },
              then: "Inactive",
              else: "Active"
            }
          },
              // Calculate match score — points only when job field is filled AND matches
              matchScore: {
            $add: [
              // Job category match (30 points)
              { $cond: [{ $eq: ["$jobCategoryId", jobCategoryId] }, 30, 0] },

              // Salary match (20) — real range / salary only; empty or 0-0 = no points
              {
                $cond: [
                  {
                    $and: [
                      { $gt: [expectedSalary, 0] },
                      {
                        $or: [
                          {
                            $and: [
                              { $gt: ["$salaryRangeEnd", 0] },
                              { $lte: ["$salaryRangeStart", expectedSalary] },
                              { $gte: ["$salaryRangeEnd", expectedSalary] },
                            ],
                          },
                          {
                            $and: [
                              {
                                $eq: [
                                  {
                                    $convert: {
                                      input: "$salary",
                                      to: "double",
                                      onError: -1,
                                      onNull: -1,
                                    },
                                  },
                                  expectedSalary,
                                ],
                              },
                            ],
                          },
                          {
                            $and: [
                              {
                                $gt: [
                                  {
                                    $convert: {
                                      input: "$salary",
                                      to: "double",
                                      onError: 0,
                                      onNull: 0,
                                    },
                                  },
                                  0,
                                ],
                              },
                              {
                                $lte: [
                                  {
                                    $convert: {
                                      input: "$salary",
                                      to: "double",
                                      onError: 0,
                                      onNull: 0,
                                    },
                                  },
                                  expectedSalary,
                                ],
                              },
                            ],
                          },
                          {
                            $and: [
                              { $eq: ["$negotiable", "yes"] },
                              {
                                $or: [
                                  { $gt: ["$salaryRangeEnd", 0] },
                                  {
                                    $gt: [
                                      {
                                        $convert: {
                                          input: "$salary",
                                          to: "double",
                                          onError: 0,
                                          onNull: 0,
                                        },
                                      },
                                      0,
                                    ],
                                  },
                                ],
                              },
                            ],
                          },
                        ],
                      },
                    ],
                  },
                  20,
                  0,
                ],
              },

              // Experience match (10) — only if job min experience is set
              {
                $cond: [
                  {
                    $and: [
                      { $ne: ["$minExperienceYears", null] },
                      { $ne: ["$minExperienceYears", ""] },
                      {
                        $let: {
                          vars: {
                            minExp: {
                              $convert: {
                                input: "$minExperienceYears",
                                to: "double",
                                onError: null,
                                onNull: null,
                              },
                            },
                          },
                          in: {
                            $and: [
                              { $ne: ["$$minExp", null] },
                              { $lte: ["$$minExp", candidateExperience] },
                            ],
                          },
                        },
                      },
                    ],
                  },
                  10,
                  0,
                ],
              },

              // Location match (5) — only if both sides have location
              {
                $cond: [
                  {
                    $and: [
                      { $ne: ["$jobLocation", null] },
                      { $ne: ["$jobLocation", ""] },
                      preferredLocation
                        ? {
                            $regexMatch: {
                              input: "$jobLocation",
                              regex: new RegExp(preferredLocation, "i"),
                            },
                          }
                        : { $literal: false },
                    ],
                  },
                  5,
                  0,
                ],
              },

              // Qualification match (5) — only if job qualification is set; "any" matches all
              {
                $cond: [
                  {
                    $and: [
                      { $ne: ["$qualification", null] },
                      { $ne: ["$qualification", ""] },
                      {
                        $or: [
                          {
                            $eq: [
                              {
                                $toLower: {
                                  $trim: {
                                    input: {
                                      $toString: "$qualification",
                                    },
                                  },
                                },
                              },
                              "any",
                            ],
                          },
                          {
                            $eq: [
                              {
                                $toLower: {
                                  $trim: {
                                    input: {
                                      $toString: {
                                        $ifNull: ["$qualification", ""],
                                      },
                                    },
                                  },
                                },
                              },
                              String(candidateQualifications || "")
                                .trim()
                                .toLowerCase(),
                            ],
                          },
                        ],
                      },
                    ],
                  },
                  5,
                  0,
                ],
              },
            ],
          }
        }
      },
      {
        $match: matchConditions
      },
      {
        $lookup: {
          from: "jobCategory",
          localField: "jobCategoryId",
          foreignField: "id",
          as: "jobCategory"
        }
      },
      {
        $addFields: {
          jobCategory: { $arrayElemAt: ["$jobCategory", 0] }
        }
      },
      // {
      //   $lookup: {
      //     from: "industries",
      //     localField: "industriesId",
      //     foreignField: "id",
      //     as: "industries"
      //   }
      // },
      // {
      //   $addFields: {
      //     industries: { $arrayElemAt: ["$industries", 0] }
      //   }
      // },
      {
        $lookup: {
          from: "clients",
          localField: "userId",
          foreignField: "userId",
          as: "client",
          pipeline: [
            {
              $project: {
                // bannerImage: 1,
                companyName: 1,
                companyowner: 1,
                mobile: 1,
                email: 1,
              },
            },
          ],
        }
      },
      {
        $addFields: {
          client: { $arrayElemAt: ["$client", 0] }
        }
      },
      {
        $lookup: {
          from: "jobapplications",
          let: { jobId: "$id", candidateId: candidateId },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$jobOpeningId", "$$jobId"] },
                    { $eq: ["$candidateId", "$$candidateId"] }
                  ]
                }
              }
            },
            {
              $project: { _id: 1 }
            }
          ],
          as: "jobApplication"
        }
      },
      {
        $addFields: {
          appliedStatus: {
            $cond: {
              if: { $gt: [{ $size: "$jobApplication" }, 0] },
              then: "applied",
              else: "notapplied"
            }
          }
        }
      },
      {
        $project: { jobApplication: 0 }
      },
      {
        $sort: {
          matchScore: -1,
          hotvacancy: -1,
          createdAt: -1
        }
      },
      {
        $skip: (page - 1) * perPage
      },
      {
        $limit: perPage
      }
    ]);

    // Get total count for pagination
    const totalCount = await JobOpening.aggregate([
      {
        $addFields: {
          status: {
            $cond: {
              if: {
                $gte: [
                  {
                    $divide: [
                      { $subtract: [new Date(), "$hotvacancy"] },
                      24 * 60 * 60 * 1000 * process.env.JOB_ACTIVE_DAYS || 30// 30 days in milliseconds
                    ],
                  },
                  process.env.JOB_ACTIVE_DAYS || 30,
                ],
              },
              then: "Inactive",
              else: "Active"
            }
          }
        }
      },
      {
        $match: matchConditions
      },
      {
        $count: "total"
      }
    ]);

    res.json({
      results: matchingJobs,
      total: totalCount[0]?.total || 0,
      page,
      perPage,
      totalPages: Math.ceil((totalCount[0]?.total || 0) / perPage),
      matchCriteria: {
        industry: "Not Required",
        jobCategory: jobCategoryId ? "Required" : "Optional",
        salary: "Within range or negotiable",
        experience: "Meets minimum requirements",
        location: "Fuzzy match preferred location",
        qualification: "Match if specified (any = all)"
      }
    });

  } catch (error) {
    console.error("Error getting matching jobs for candidate:", error);
    res.status(500).json({ msg: "Internal server error" });
  }
};

exports.getSingleCandidateDetails = async (req, res) => {
  try {
    const authUser = req.user;

    if (!authUser || !authUser.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const candidate = await Candidates.findOne({ userId: authUser.id });

    if (!candidate) {
      return res.status(404).json({ error: "Candidate profile not found" });
    }

    return res.json(candidate);
  } catch (error) {
    console.error("getSingleCandidateDetails error", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

const { parseResumeData } = require("../services/resumeParser");
const { getResumeExtractionStatus } = require("../middleware/apiIntegration/configResolver");

exports.getResumeExtractionConfigStatus = async (req, res) => {
  try {
    const resumeExtraction = await getResumeExtractionStatus();
    return res.json({
      success: true,
      resumeExtraction,
    });
  } catch (error) {
    console.error("getResumeExtractionConfigStatus error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to check OCR & API Configuration status",
    });
  }
};

exports.parseResume = async (req, res) => {
  try {
    const resumeExtraction = await getResumeExtractionStatus();
    if (!resumeExtraction.ready) {
      return res.json({
        success: false,
        error: resumeExtraction.message,
        code: "API_CONFIG_NOT_SET",
        missing: resumeExtraction.missing,
      });
    }

    const file = req.files?.resume || req.files?.file;
    if (!file) {
      return res.json({ success: false, error: "No resume file uploaded" });
    }

    const { parsedData, parser, extractionSource, confidence } = await parseResumeData(
      file.data,
      file.mimetype,
      file.name
    );
    return res.json({ success: true, data: parsedData, parser, extractionSource, confidence });
  } catch (error) {
    console.error("parseResume error:", error);
    return res.json({
      success: false,
      error: error.message || "Failed to parse resume",
      code: error.code || "PARSE_RESUME_FAILED",
    });
  }
};

exports.publicParseResume = async (req, res) => {
  try {
    const resumeExtraction = await getResumeExtractionStatus();
    if (!resumeExtraction.ready) {
      return res.json({
        success: false,
        error: resumeExtraction.message,
        code: "API_CONFIG_NOT_SET",
        missing: resumeExtraction.missing,
      });
    }

    const file = req.files?.resume || req.files?.file;
    if (!file) {
      return res.json({ success: false, error: "No resume file uploaded" });
    }

    const { parsedData, parser, extractionSource, confidence } = await parseResumeData(
      file.data,
      file.mimetype,
      file.name
    );
    return res.json({ success: true, data: parsedData, parser, extractionSource, confidence });
  } catch (error) {
    console.error("publicParseResume error:", error);
    return res.json({
      success: false,
      error: error.message || "Failed to parse resume",
      code: error.code || "PARSE_RESUME_FAILED",
    });
  }
};

