/**
 * Weighted candidate profile completion.
 *
 * Each section scores its full weight only when ALL of its fields are filled.
 * Synced with frontend utility/profileCompleteness.js and create-form validation.
 */

const PROFILE_COMPLETION_WEIGHTS = {
  personalInformation: 15,
  contactInformation: 15,
  education: 15,
  experience: 15,
  skills: 10,
  resumeUploaded: 15,
  currentSalary: 7.5,
  expectedSalary: 7.5,
};

/** Non-empty check for profile section required fields. */
const isFilled = (value, { treatZeroAsEmpty = false } = {}) => {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return false;
    const lower = trimmed.toLowerCase();
    if (
      lower === "current monthly salary + 20%" ||
      lower === "current employer" ||
      lower === "current company" ||
      lower.startsWith("select ")
    ) {
      return false;
    }
    if (treatZeroAsEmpty && /^0+(\.0+)?$/.test(trimmed)) return false;
    return true;
  }
  if (typeof value === "number") {
    if (Number.isNaN(value)) return false;
    if (treatZeroAsEmpty && value === 0) return false;
    return true;
  }
  if (Array.isArray(value)) return value.length > 0;
  return false;
};

/**
 * Mongo expression: field exists and is not empty string.
 * Works for string fields.
 */
const mongoIsFilled = (fieldPath) => ({
  $and: [
    { $ne: [{ $ifNull: [fieldPath, null] }, null] },
    {
      $gt: [
        {
          $strLenCP: {
            $trim: {
              input: { $toString: { $ifNull: [fieldPath, ""] } },
            },
          },
        },
        0,
      ],
    },
  ],
});

/** Mongo: numeric / numeric-string field that must be > 0 (salaries). */
const mongoIsFilledPositive = (fieldPath) => ({
  $gt: [
    {
      $convert: {
        input: { $ifNull: [fieldPath, 0] },
        to: "double",
        onError: 0,
        onNull: 0,
      },
    },
    0,
  ],
});

/**
 * Mongo: experience field filled.
 * Accepts numeric years ("3", "4.5") and range labels ("0-1 year", "1-3 year").
 * Rejects empty / pure zero ("0", "0.0").
 */
const mongoIsFilledExperience = (fieldPath) => ({
  $and: [
    mongoIsFilled(fieldPath),
    {
      $not: {
        $regexMatch: {
          input: {
            $trim: {
              input: { $toString: { $ifNull: [fieldPath, ""] } },
            },
          },
          regex: "^0+(\\.0+)?$",
        },
      },
    },
  ],
});

/**
 * Calculate profile completeness for a candidate document.
 * @returns {{ profileCompleteness: number, profileCompletenessLabel: string, profileCompletenessBreakdown: object }}
 */
const calculateProfileCompleteness = (candidate = {}) => {
  const professional = candidate.professional || {};
  const hasIndustries =
    Array.isArray(candidate.industries_relation) &&
    candidate.industries_relation.length > 0;

  const currentSalary =
    professional.currentSalary ?? candidate.currentSalary ?? null;
  const expectedsalary =
    professional.expectedsalary ??
    candidate.expectedsalary ??
    candidate.expectedSalary ??
    null;

  const breakdown = {
    personalInformation: false,
    contactInformation: false,
    education: false,
    experience: false,
    skills: false,
    resumeUploaded: false,
    currentSalary: false,
    expectedSalary: false,
  };

  breakdown.personalInformation =
    isFilled(candidate.firstname) &&
    isFilled(candidate.lastname) &&
    isFilled(candidate.gender);

  breakdown.contactInformation =
    isFilled(candidate.mobile) &&
    isFilled(candidate.email) &&
    isFilled(candidate.alternateMobile) &&
    (isFilled(candidate.stateId) || isFilled(candidate.state)) &&
    (isFilled(candidate.cityId) || isFilled(candidate.city));

  breakdown.education =
    isFilled(professional.highestQualification) &&
    isFilled(professional.field);

  breakdown.experience =
    isFilled(professional.experienceInyear, { treatZeroAsEmpty: true }) &&
    isFilled(professional.designation) &&
    (isFilled(professional.jobCategoryId) ||
      Boolean(professional.jobCategory?.id || professional.jobCategory?._id)) &&
    hasIndustries &&
    isFilled(professional.noticePeriod) &&
    isFilled(professional.currentlyWorking) &&
    // Resume often fills employer OR company — either is enough
    (isFilled(professional.currentEmployer) ||
      isFilled(professional.currentCompany) ||
      String(professional.currentlyWorking || "")
        .trim()
        .toLowerCase() === "no");

  breakdown.skills =
    isFilled(professional.skill) &&
    isFilled(professional.english) &&
    isFilled(professional.preferedJobLocation);

  breakdown.resumeUploaded = isFilled(candidate.resume);

  breakdown.currentSalary = isFilled(currentSalary, {
    treatZeroAsEmpty: true,
  });
  breakdown.expectedSalary = isFilled(expectedsalary, {
    treatZeroAsEmpty: true,
  });

  let score = 0;
  for (const [key, filled] of Object.entries(breakdown)) {
    if (filled) score += PROFILE_COMPLETION_WEIGHTS[key];
  }

  const profileCompleteness = Math.round(score);

  return {
    profileCompleteness,
    profileCompletenessLabel: `${profileCompleteness}% Complete`,
    profileCompletenessBreakdown: breakdown,
  };
};

/**
 * Aggregation stages that mirror calculateProfileCompleteness.
 * Returns an array of pipeline stages.
 */
const buildProfileCompletenessAddFieldsStages = () => [
  {
    $addFields: {
      profileCompleteness: {
        $round: [
          {
            $add: [
              {
                $cond: [
                  {
                    $and: [
                      mongoIsFilled("$firstname"),
                      mongoIsFilled("$lastname"),
                      mongoIsFilled("$gender"),
                    ],
                  },
                  PROFILE_COMPLETION_WEIGHTS.personalInformation,
                  0,
                ],
              },
              {
                $cond: [
                  {
                    $and: [
                      mongoIsFilled("$mobile"),
                      mongoIsFilled("$email"),
                      mongoIsFilled("$alternateMobile"),
                      {
                        $or: [
                          mongoIsFilled("$stateId"),
                          mongoIsFilled("$state"),
                        ],
                      },
                      {
                        $or: [
                          mongoIsFilled("$cityId"),
                          mongoIsFilled("$city"),
                        ],
                      },
                    ],
                  },
                  PROFILE_COMPLETION_WEIGHTS.contactInformation,
                  0,
                ],
              },
              {
                $cond: [
                  {
                    $and: [
                      mongoIsFilled("$professional.highestQualification"),
                      mongoIsFilled("$professional.field"),
                    ],
                  },
                  PROFILE_COMPLETION_WEIGHTS.education,
                  0,
                ],
              },
              {
                $cond: [
                  {
                    $and: [
                      mongoIsFilledExperience(
                        "$professional.experienceInyear"
                      ),
                      mongoIsFilled("$professional.designation"),
                      {
                        $or: [
                          mongoIsFilled("$professional.jobCategoryId"),
                          mongoIsFilled("$professional.jobCategory.id"),
                        ],
                      },
                      {
                        $gt: [
                          {
                            $size: {
                              $ifNull: ["$industries_relation", []],
                            },
                          },
                          0,
                        ],
                      },
                      mongoIsFilled("$professional.noticePeriod"),
                      mongoIsFilled("$professional.currentlyWorking"),
                      {
                        $or: [
                          mongoIsFilled("$professional.currentEmployer"),
                          mongoIsFilled("$professional.currentCompany"),
                          {
                            $eq: [
                              {
                                $toLower: {
                                  $trim: {
                                    input: {
                                      $toString: {
                                        $ifNull: [
                                          "$professional.currentlyWorking",
                                          "",
                                        ],
                                      },
                                    },
                                  },
                                },
                              },
                              "no",
                            ],
                          },
                        ],
                      },
                    ],
                  },
                  PROFILE_COMPLETION_WEIGHTS.experience,
                  0,
                ],
              },
              {
                $cond: [
                  {
                    $and: [
                      mongoIsFilled("$professional.skill"),
                      mongoIsFilled("$professional.english"),
                      mongoIsFilled("$professional.preferedJobLocation"),
                    ],
                  },
                  PROFILE_COMPLETION_WEIGHTS.skills,
                  0,
                ],
              },
              {
                $cond: [
                  mongoIsFilled("$resume"),
                  PROFILE_COMPLETION_WEIGHTS.resumeUploaded,
                  0,
                ],
              },
              {
                $cond: [
                  mongoIsFilledPositive("$professional.currentSalary"),
                  PROFILE_COMPLETION_WEIGHTS.currentSalary,
                  0,
                ],
              },
              {
                $cond: [
                  mongoIsFilledPositive("$professional.expectedsalary"),
                  PROFILE_COMPLETION_WEIGHTS.expectedSalary,
                  0,
                ],
              },
            ],
          },
          0,
        ],
      },
    },
  },
  {
    $addFields: {
      profileCompletenessLabel: {
        $concat: [{ $toString: "$profileCompleteness" }, "% Complete"],
      },
    },
  },
];

/** @deprecated use buildProfileCompletenessAddFieldsStages */
const buildProfileCompletenessAddFieldsStage = () =>
  buildProfileCompletenessAddFieldsStages()[0];

/**
 * Build $match filter for listing completion filters.
 * Accepts: "100" | "above80" | "below50" (and a few aliases).
 */
const getProfileCompletionMatchFilter = (filterValue) => {
  if (!filterValue && filterValue !== 0) return null;

  const normalized = String(filterValue).trim().toLowerCase();

  if (
    normalized === "100" ||
    normalized === "100%" ||
    normalized === "complete" ||
    normalized === "100% complete"
  ) {
    return { profileCompleteness: 100 };
  }

  if (
    normalized === "above80" ||
    normalized === "above_80" ||
    normalized === ">80" ||
    normalized === "above 80%"
  ) {
    return { profileCompleteness: { $gt: 80 } };
  }

  if (
    normalized === "below50" ||
    normalized === "below_50" ||
    normalized === "<50" ||
    normalized === "below 50%"
  ) {
    return { profileCompleteness: { $lt: 50 } };
  }

  return null;
};

const getProfileCompletionMatchStage = (filterValue) => {
  const match = getProfileCompletionMatchFilter(filterValue);
  return match ? { $match: match } : null;
};

module.exports = {
  PROFILE_COMPLETION_WEIGHTS,
  isFilled,
  calculateProfileCompleteness,
  buildProfileCompletenessAddFieldsStage,
  buildProfileCompletenessAddFieldsStages,
  getProfileCompletionMatchFilter,
  getProfileCompletionMatchStage,
};
