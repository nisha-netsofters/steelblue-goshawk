const path = require("path");
// Load env from project root regardless of current working directory
require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env") });
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const handlebars = require("handlebars");
const fs = require("fs");
const moment = require("moment");
const Subscription = require("../../models-v2/subscriptions_Mongoose");
const Plans = require("../../models-v2/plans_Mongoose");
const PlanFeatures = require("../../models-v2/planFeatures_Mongoose");
const User = require("../../models-v2/users_Mongoose");
const Role = require("../../models-v2/role_Mongoose");
const SuperAdmin = require("../../models-v2/superAdmin_Mongooes");
const BRAND = {
  name: process.env.BRAND_NAME || "Unique World Placement Services",
  primary: process.env.BRAND_PRIMARY || "#0f172a",
  accent: process.env.BRAND_ACCENT || "#2563eb",
  logoUrl:
    process.env.BRAND_LOGO_URL ||
    "https://unique-world-pro.s3.amazonaws.com/assets/1710753058939unique.0e90a6c9724ea8d30d0e.png",
  portalUrl: process.env.PORTAL_URL || "https://portal.uniqueworldjobs.com/login",
  supportEmail: process.env.SUPPORT_EMAIL || "uniqueworldjobs@gmail.com",
  year: new Date().getFullYear(),
};
const withBrand = (obj = {}) => ({ brand: BRAND, ...obj });

const maskPhone = (phone) => {
  if (!phone || phone.length < 5) return phone;
  const maskedArea = "*".repeat(phone.length - 4);
  return phone.substring(0, 2) + maskedArea + phone.substring(phone.length - 2);
};

const maskEmail = (email) => {
  if (!email || !email.includes("@")) return email;
  const [user, domain] = email.split("@");
  if (user.length <= 2) return "*".repeat(user.length) + "@" + domain;
  return user.substring(0, 2) + "*".repeat(user.length - 2) + "@" + domain;
};

const safeName = (first, last, fallback = "Candidate") => {
  const f = first?.trim();
  const l = last?.trim();
  if (f && l) return `${f} ${l}`;
  if (f) return f;
  if (l) return l;
  return fallback;
};

let adminRoleId = null;
const getAdminRoleId = async () => {
  if (adminRoleId) return adminRoleId;
  try {
    const role = await Role.findOne({ name: { $regex: /^admin$/i } });
    adminRoleId = role?.id;
    return adminRoleId;
  } catch (err) {
    console.error("Error fetching Admin role ID:", err);
    return null;
  }
};

const checkIsAdmin = async (email) => {
  if (!email) return false;
  const normalizedEmail = email.toLowerCase().trim();
  try {
    const superAdmin = await SuperAdmin.findOne({ email: normalizedEmail });
    if (superAdmin) return true;

    const rid = await getAdminRoleId();
    if (rid) {
      const user = await User.findOne({ email: normalizedEmail, roleId: rid });
      if (user) return true;
    }
    return false;
  } catch (err) {
    console.error("Error checking admin status for:", email, err);
    return false;
  }
};

const resolveRecipientsAndMasking = async (emailTo) => {
  if (!emailTo) return { admins: [], others: [] };
  const emails = (typeof emailTo === "string" ? emailTo.split(",") : Array.isArray(emailTo) ? emailTo : [emailTo])
    .map((e) => (typeof e === "string" ? e.trim() : ""))
    .filter(Boolean);

  const admins = [];
  const others = [];

  for (const email of emails) {
    if (await checkIsAdmin(email)) {
      admins.push(email);
    } else {
      others.push(email);
    }
  }
  return { admins, others };
};

// ZeptoMail SMTP transporter
// Make sure these env variables are set in your `.env` file:
// ZEPTO_SMTP_HOST=smtp.zeptomail.in
// ZEPTO_SMTP_PORT=587
// ZEPTO_SMTP_USER=emailapikey
// ZEPTO_SMTP_PASS=<your_zeptomail_smtp_api_key>
const transporter =
  process.env.NODE_ENV !== "staging"
    ? nodemailer.createTransport({
      host: process.env.ZEPTO_SMTP_HOST || "smtp.zeptomail.in",
      port: Number(process.env.ZEPTO_SMTP_PORT) || 587,
      secure: false, // ZeptoMail uses STARTTLS on 587
      auth: {
        user: process.env.ZEPTO_SMTP_USER,
        pass: process.env.ZEPTO_SMTP_PASS,
      },
      requireTLS: true,
      connectionTimeout: 10 * 60 * 1000,
    })
    : {
      sendMail: async () => console.log("Email sent skip"),
    };
// ZeptoMail only allows sending from verified domains/senders.
// Set ZEPTO_FROM_EMAIL in .env to a sender address that is verified in ZeptoMail.
const FROM_EMAIL =
  process.env.ZEPTO_FROM_EMAIL ||
  process.env.REACT_APP_USER ||
  "no-reply@your-verified-domain.com";
exports.sendEmailLink = async (user) => {
  const filePath = path.join(__dirname, "./tamplates/forgotPassword.html");
  const source = fs.readFileSync(filePath, "utf-8").toString();
  const template = handlebars.compile(source);
  const token = jwt.sign({ user }, process.env.SECRET, {
    expiresIn: process.env.FORGOT_PASSWORD_TIMEOUT,
  });
  const replacements = {
    name: user.name,
    link: `${process.env.FORGOT_PASSWORD_LINK}id=${user?.id}&token=${token}`,
  };
  const htmlToSend = template(withBrand(replacements));
  if (process.env.NODE_ENV !== "staging") {
    await transporter.sendMail({
      from: FROM_EMAIL,
      bcc: user?.email,
      subject: "Reset Password",
      html: htmlToSend,
    });
  } else {
    console.log("Email sent skip");
  }
};

exports.sendInterviewRequestEmail = async (client, candidate, emailTo) => {
  const filePath = path.join(__dirname, "./tamplates/interviewRequest.html");
  const source = fs.readFileSync(filePath, "utf-8").toString();
  const template = handlebars.compile(source);
  let isSent = false;

  const candidateName = safeName(candidate?.firstname, candidate?.lastname);
  const { admins, others } = await resolveRecipientsAndMasking(emailTo);

  const sendVersion = async (recipients, isMasked) => {
    const mobileToSend = isMasked ? maskPhone(candidate?.mobile) : candidate?.mobile;
    const emailToSend = isMasked ? maskEmail(candidate?.email) : candidate?.email;
    const replacements = {
      clientName: client?.companyowner,
      CompanyName: client?.companyName,
      clientMobile: client?.mobile,
      clientemail: client?.email,
      candidateName: candidateName,
      candidateMobile: mobileToSend,
      candidateEmail: emailToSend,
      jobCategory: candidate?.professional?.jobCategory?.jobCategory,
    };

    const htmlToSend = template(withBrand(replacements));
    await transporter
      .sendMail({
        from: FROM_EMAIL,
        bcc: recipients,
        subject: `${client?.companyName || "A Client"} - Interview Request`,
        html: htmlToSend,
      })
      .then(() => (isSent = true));
  };

  if (admins.length > 0) await sendVersion(admins, false);
  if (others.length > 0) await sendVersion(others, true);

  return isSent;
};

exports.sendInterviewRequestEmailforUniqueworld = async (
  client,
  candidate,
  emailTo
) => {
  const filePath = path.join(__dirname, "./tamplates/interviewRequest.html");
  const source = fs.readFileSync(filePath, "utf-8").toString();
  const template = handlebars.compile(source);
  let isSent = false;

  const candidateName = safeName(candidate?.firstname, candidate?.lastname);
  const { admins, others } = await resolveRecipientsAndMasking(emailTo);

  const uniqueWorldEmail = "helpuniqueworld@gmail.com";
  const isUniqueWorldAdmin = await checkIsAdmin(uniqueWorldEmail);

  const sendVersion = async (toAdmins, recipients) => {
    const isMasked = !toAdmins;
    const mobileToSend = isMasked ? maskPhone(candidate?.mobile) : candidate?.mobile;
    const emailToSend = isMasked ? maskEmail(candidate?.email) : candidate?.email;
    const replacements = {
      clientName: client?.companyowner,
      CompanyName: client?.companyName,
      clientMobile: client?.mobile,
      clientemail: client?.email,
      candidateName: candidateName,
      candidateMobile: mobileToSend,
      candidateEmail: emailToSend,
      jobCategory: candidate?.professional?.jobCategory?.jobCategory,
    };

    const htmlToSend = template(withBrand(replacements));
    const mailOptions = {
      from: FROM_EMAIL,
      bcc: recipients,
      subject: `${client?.companyName || "A Client"} - Interview Request`,
      html: htmlToSend,
    };

    if (toAdmins === isUniqueWorldAdmin) {
      mailOptions.cc = uniqueWorldEmail;
    }

    await transporter
      .sendMail(mailOptions)
      .then(() => (isSent = true));
  };

  if (admins.length > 0 || (isUniqueWorldAdmin && others.length === 0)) {
    await sendVersion(true, admins);
  }

  if (others.length > 0 || (!isUniqueWorldAdmin && admins.length === 0)) {
    await sendVersion(false, others);
  }

  return isSent;
};

exports.sendcandidateRegistrationSuccessfully = async (candidate, emailTo, companyName, companyowner) => {
  const email = [process.env.INTERVIEW_REQUEST, process.env.REACT_APP_USER];
  try {
    const filePath = path.join(
      __dirname,
      "./tamplates/candidateRegistrationSuccess.html"
    );
    const source = fs.readFileSync(filePath, "utf-8").toString();
    const template = handlebars.compile(source);
    let industries = "";
    candidate?.industries_relation?.forEach((ele, i) => {
      if (i == 0) industries = ele?.industries?.industryCategory;
      else
        industries = industries?.concat(
          " | ",
          ele?.industries?.industryCategory
        );
    });
    const formatSalary = (salary) => {
      if (salary == null) return "To be discussed";
      return `₹${new Intl.NumberFormat("en-IN").format(salary)}`;
    };

    const candidateName = safeName(candidate?.firstname, candidate?.lastname);
    const formattedExpectedSalary = formatSalary(candidate?.professional?.expectedsalary);

    const { admins, others } = await resolveRecipientsAndMasking(emailTo);

    const sendVersion = async (recipients, isMasked) => {
      const replacements = {
        name: candidateName,
        companyowner: companyowner || "Hiring Manager",
        companyName: companyName || BRAND.name,
        email: (isMasked ? maskEmail(candidate?.email) : candidate?.email) || "Not provided",
        mobile: (isMasked ? maskPhone(candidate?.mobile) : candidate?.mobile) || "Not provided",
        jobCategory: candidate?.professional?.jobCategory?.jobCategory || "Open to opportunities",
        industries: industries || "Diverse Sectors",
        expectedSalary: formattedExpectedSalary,
        preferedJobLocation: candidate?.professional?.preferedJobLocation || "Location not specified",
      };
      const htmlToSend = template(withBrand(replacements));
      await transporter.sendMail({
        from: FROM_EMAIL,
        bcc: recipients,
        subject: `${companyName || "Company"} - I'm ${candidateName} ready to work under salary: ${formattedExpectedSalary}`,
        html: htmlToSend,
      });
    };

    if (admins.length > 0) await sendVersion(admins, false);
    if (others.length > 0) await sendVersion(others, true);
  } catch (err) {
    console.info("----------------------------");
    console.info("new Candidate adeed send msg =>", err);
    console.info("----------------------------");
  }
};

exports.sendClientApproval = async (client, agency) => {
  try {
    const filePath = path.join(__dirname, "./tamplates/clientApproval.html");
    const source = fs.readFileSync(filePath, "utf-8").toString();
    const template = handlebars.compile(source);
    const replacements = {
      name: client?.companyowner || client?.name || "Client",
      id: client?.email || "your registered email",
      password: client?.password || "your secret password",
      companyName: client?.companyName || "your organization",
      agencyName: agency?.name || BRAND.name,
      agencyNumber: agency?.mobileNumber || "our support line",
    };
    const htmlToSend = template(withBrand(replacements));
    await transporter.sendMail({
      from: FROM_EMAIL,
      bcc: client?.email,
      subject: `Your account has been approved`,
      html: htmlToSend,
    });
  } catch (err) {
    console.info("----------------------------");
    console.info("clietn approval send msg =>", err);
    console.info("----------------------------");
  }
};

exports.newClientAdded = async (client, emailTo) => {
  const email = [process.env.INTERVIEW_REQUEST, process.env.REACT_APP_USER];
  try {
    const filePath = path.join(
      __dirname,
      "./tamplates/clientRegistrationSuccess.html"
    );
    const source = fs.readFileSync(filePath, "utf-8").toString();
    const template = handlebars.compile(source);
    const replacements = {
      companyowner: client?.companyowner || "Partner",
      name: client?.companyName || client?.name || "Valued Client",
      email: client?.email || "Not provided",
      mobile: client?.mobile || "Not provided",
    };
    const htmlToSend = template(withBrand(replacements));
    await transporter.sendMail({
      from: FROM_EMAIL,
      bcc: emailTo,
      subject: `Welcome to Unique World - ${client?.companyName || "Partner"}`,
      html: htmlToSend,
    });
  } catch (err) {
    console.info("----------------------------");
    console.info("new client adeed send msg =>", err);
    console.info("----------------------------");
  }
};

exports.newCandidatewelcomeEmail = async (candidate, agencyname) => {
  try {
    const filePath = path.join(__dirname, "./tamplates/candidateApply.html");
    const source = fs.readFileSync(filePath, "utf-8").toString();
    const template = handlebars.compile(source);
    const replacements = {
      candidateName: safeName(candidate?.firstname, candidate?.lastname),
      agencyName: agencyname || BRAND.name,
    };
    const htmlToSend = template(withBrand(replacements));
    await transporter.sendMail({
      from: FROM_EMAIL,
      bcc: candidate?.email,
      subject: "Successfully Registered",
      html: htmlToSend,
    });
  } catch (err) {
    console.info("----------------------------");
    console.info("new candidate adeed send msg =>", err);
    console.info("----------------------------");
  }
};
exports.sendtoAllClientmailAdded = async (
  clientsEmail,
  candidate,
  agencyName,
  jobTitle
) => {
  const mails = [];
  clientsEmail.forEach((element) => {
    if (element?.mailNotification) {
      mails.push(element?.email);
    }
  });
  try {
    if (mails?.length) {
      const filePath = path.join(
        __dirname,
        "./tamplates/industrysMatchedClient.html"
      );
      const source = fs.readFileSync(filePath, "utf-8").toString();
      const template = handlebars.compile(source);
      const formatSalary = (salary) => {
        if (salary == null) return "To be discussed";
        return `₹${new Intl.NumberFormat("en-IN").format(salary)}`;
      };

      const candidateName = safeName(candidate?.firstname, candidate?.lastname);
      const formattedExpectedSalary = formatSalary(candidate?.professional?.expectedsalary);

      const replacements = {
        candidateName: candidateName,
        currentSalary: formatSalary(candidate?.professional?.currentSalary),
        expectedSalary: formattedExpectedSalary,
        jobCategory: candidate?.professional?.jobCategory?.jobCategory || "Open to opportunities",
        agencyName: agencyName || "The Recruitment Team",
        jobTitle: jobTitle || "a position matching your requirements",
      };
      const htmlToSend = template(withBrand(replacements));
      const emailPromises = clientsEmail
        .filter((element) => element?.mailNotification)
        .map(async (element) => {
          const individualReplacements = {
            ...replacements,
            companyowner: element?.companyowner || "Hiring Team",
            companyName: element?.companyName || "your organization",
          };
          const individualHtml = template(withBrand(individualReplacements));
          return transporter.sendMail({
            from: FROM_EMAIL,
            to: element?.email,
            subject: `${element?.companyName || "Recruitment Update"} - New candidate ${candidateName} matches your requirements`,
            html: individualHtml,
          });
        });

      const results = await Promise.allSettled(emailPromises);
      results.forEach((result) => {
        if (result.status === "rejected") {
          console.error("Email sending failed:", result.reason);
        }
      });
    }
  } catch (err) {
    console.info("----------------------------");
    console.info("new client adeed send msg =>", err);
    console.info("----------------------------");
  }
};
exports.sendTomatchIndustriesClients = async (
  clientsEmail,
  industries
) => {
  const mails = [];
  clientsEmail.forEach((element) => {
    if (element?.mailNotification) {
      mails.push(element?.email);
    }
  });
  try {
    if (mails?.length) {
      const filePath = path.join(
        __dirname,
        "./tamplates/clientsAllMail.html"
      );
      const source = fs.readFileSync(filePath, "utf-8").toString();
      const template = handlebars.compile(source);
      const replacements = {
        industry: industries
      };
      const htmlToSend = template(withBrand(replacements));
      const emailPromises = clientsEmail
        .filter((element) => element?.mailNotification)
        .map(async (element) => {
          const individualReplacements = {
            ...replacements,
            companyowner: element?.companyowner || "Partner",
            companyName: element?.companyName || "Your Organization",
          };
          const individualHtml = template(withBrand(individualReplacements));
          return transporter.sendMail({
            from: FROM_EMAIL,
            to: element?.email,
            subject: `${element?.companyName || "Your Organization"} - New Industry Match: ${industries || "Relevant"} Industry - Unique World Placement Services`,
            html: individualHtml,
          });
        });

      const results = await Promise.allSettled(emailPromises);
      results.forEach((result) => {
        if (result.status === "rejected") {
          console.error("Email sending failed (Industries Match):", result.reason);
        }
      });
    }
  } catch (err) {
    console.info("----------------------------");
    console.info("new client adeed send msg to all clients =>", err);
    console.info("----------------------------");
  }
};

exports.sendBulkMail = async (obj) => {
  try {
    await transporter.sendMail({
      from: FROM_EMAIL,
      bcc: obj?.mails,
      subject: obj?.subject,
      html: obj?.html,
    });
    return true;
  } catch (err) {
    console.info("----------------------------");
    console.info("bulk msg sent=>", err);
    console.info("----------------------------");
    return false;
  }
};

exports.paymentSuccessfulMail = async (
  clientData,
  paymentData,
  planData,
  agencyName
) => {
  try {
    const filePath = path.join(
      __dirname,
      "./tamplates/clientPaymentSuccessful.html"
    );
    const source = fs.readFileSync(filePath, "utf-8").toString();
    const template = handlebars.compile(source);
    const date = new Date(paymentData?.createdAt);
    const day = Number(planData?.planFeature?.validate_days);
    date.setDate(date.getDate() + day);
    const expireDate = date.toISOString();
    console.log(expireDate);
    const formatSalary = (salary) => {
      if (salary == null) return "To be discussed";
      return `₹${new Intl.NumberFormat("en-IN").format(salary)}`;
    };

    const replacements = {
      clientName: clientData?.companyowner || clientData?.name || "Valued Client",
      planName: planData?.planName || "Subscription Plan",
      amount: formatSalary(paymentData?.amount),
      paymentDate: paymentData?.createdAt ? moment(paymentData.createdAt).format("DD-MM-YYYY") : moment().format("DD-MM-YYYY"),
      planExpireDate: expireDate ? moment(expireDate).format("DD-MM-YYYY") : "To be confirmed",
      agencyName: agencyName || BRAND.name,
    };
    const htmlToSend = template(withBrand(replacements));
    await transporter.sendMail({
      from: FROM_EMAIL,
      bcc: clientData?.email,
      subject: `${clientData?.companyName} - Payment Confirmation - Your Subscription Plan is Active`,
      html: htmlToSend,
    });
  } catch (err) {
    console.info("----------------------------");
    console.info("new candidate adeed send msg =>", err);
    console.info("----------------------------");
  }
};

exports.AddAgencyMail = async (name, email, password) => {
  try {
    const filePath = path.join(__dirname, "./tamplates/agencyCreated.html");
    const source = fs.readFileSync(filePath, "utf-8").toString();
    const template = handlebars.compile(source);
    const replacements = {
      agencyPassword: password || "Please contact support",
      agencyEmail: email || "Not available",
      agencyName: name || "Your Company",
      companyowner: name || "Admin",
    };
    const htmlToSend = template(withBrand(replacements));
    await transporter.sendMail({
      from: FROM_EMAIL,
      bcc: email,
      subject: `Agency Account Created - Credentials for ${name || "Your Organization"}`,
      html: htmlToSend,
    });
    return true;
  } catch (err) {
    console.info("----------------------------");
    console.info("bulk msg sent=>", err);
    console.info("----------------------------");
    return false;
  }
};

exports.deactivationMailToAgency = async (agencyownername, email) => {
  try {
    const filePath = path.join(
      __dirname,
      "./tamplates/noticeofdiactivation.html"
    );
    const source = fs.readFileSync(filePath, "utf-8").toString();
    const template = handlebars.compile(source);
    const replacements = {
      companyowner: agencyownername || "Agency Owner",
    };
    const htmlToSend = template(withBrand(replacements));
    await transporter.sendMail({
      from: FROM_EMAIL,
      bcc: email,
      subject: `${agencyownername || "Company"} - Notice of Subscription Deactivation for Services Utilization.`,
      html: htmlToSend,
    });
    return true;
  } catch (err) {
    console.info("----------------------------");
    console.info("bulk msg sent=>", err);
    console.info("----------------------------");
    return false;
  }
};
exports.deactivationMailToDhaval = async (agencyownername, expireDate) => {
  try {
    const filePath = path.join(
      __dirname,
      "./tamplates/mailToDhavalForDeactivation.html"
    );
    const source = fs.readFileSync(filePath, "utf-8").toString();
    const template = handlebars.compile(source);
    const replacements = {
      agencyownername: agencyownername || "agency owner",
      expireDate: expireDate || "shortly",
    };
    const htmlToSend = template(withBrand(replacements));
    await transporter.sendMail({
      from: FROM_EMAIL,
      bcc: "uniqueworldjobs@gmail.com",
      subject: `Client Subscription Expiring Soon - Immediate Action Required.`,
      html: htmlToSend,
    });
    return true;
  } catch (err) {
    console.info("----------------------------");
    console.info("bulk msg sent=>", err);
    console.info("----------------------------");
    return false;
  }
};
exports.sendCandidateLoginCredentials = async (candidate, emailTo, password) => {
  try {
    const filePath = path.join(__dirname, "./tamplates/candidateLoginCredentials.html");
    const source = fs.readFileSync(filePath, "utf-8").toString();
    const template = handlebars.compile(source);
    const replacements = {
      name: candidate?.firstname,
      email: candidate?.email,
      password: password,
    };
    const htmlToSend = template(withBrand(replacements));
    await transporter.sendMail({
      from: FROM_EMAIL,
      bcc: emailTo,
      subject: "Your Login Credentials - Unique World Placement Services",
      html: htmlToSend,
    });
    return true;
  } catch (err) {
    console.info("----------------------------");
    console.info("sendCandidateLoginCredentials error =>", err);
    console.info("----------------------------");
    return false;
  }
};
// Simple test email to verify ZeptoMail SMTP configuration
exports.sendTestEmail = async () => {
  try {
    const filePath = path.join(__dirname, "./tamplates/candidateLoginCredentials.html");
    const source = fs.readFileSync(filePath, "utf-8").toString();
    const template = handlebars.compile(source);
    const replacements = {
      name: "Shahid",
      email: "shahid1234@yopmail.com",
      password: "123456",
    };
    const htmlToSend = template(withBrand(replacements));
    await transporter.sendMail({
      from: FROM_EMAIL,
      to: "shahid1234@yopmail.com",
      subject: "ZeptoMail test from uniqueworld-backend",
      html: htmlToSend,
    });
    return true;
  } catch (err) {
    console.info("----------------------------");
    console.info("test email send error =>", err);
    console.info("----------------------------");
    return false;
  }
};
const getTemplatePath = (templateName) => {
  return path.join(__dirname, "tamplates", templateName);
};

const readEmailTemplate = (templateFileName, replacements = {}) => {
  let template = fs.readFileSync(getTemplatePath(templateFileName), "utf8");
  for (const key in replacements) {
    template = template.replace(new RegExp(`{{${key}}}`, "g"), replacements[key]);
  }
  return template;
};
const sendEmailWrapper = async (to, subject, htmlContent) => {
  try {
    await transporter.sendMail({
      from: FROM_EMAIL || "no-reply@uniqueworld.com", // Your sender email
      to: to,
      subject: subject,
      html: htmlContent,
    });
    console.log(`Email sent successfully to ${to}`);
  } catch (error) {
    console.error(`Error sending email to ${to}:`, error);
    throw error; // Re-throw to be caught by the worker for retry handling
  }
};

exports.sendCandidateJobApplyAlert = async (client, candidate, jobTitle, emailTo, jobOpeningId) => {
  const subject = `New Job Application for ${jobTitle}`;
  let canDownloadResume = false;
  let remainingDownloads = 0;

  try {
    const subscription = await Subscription.findOne({
      userId: client.userId,
      active_plan: true,
    });
    if (subscription) {
      const plan = await Plans.findOne({ id: subscription.planId });
      if (plan) {
        const planFeature = await PlanFeatures.findOne({
          id: plan.plan_feature_id,
        });
        if (planFeature) {
          const maxDownloads = Number(planFeature.resume_download_count);
          if (
            maxDownloads === -1 ||
            subscription.resume_download_count < maxDownloads
          ) {
            canDownloadResume = true;
            if (maxDownloads !== -1) {
              remainingDownloads =
                maxDownloads - subscription.resume_download_count;
            }
          }
        }
      }
    }
  } catch (error) {
    console.error("Error fetching client subscription for email:", error);
  }

  const candidateName = safeName(candidate?.firstname, candidate?.lastname);

  try {
    const filePath = path.join(
      __dirname,
      "./tamplates/candidateJobApplyAlert.html"
    );
    const source = fs.readFileSync(filePath, "utf-8").toString();
    const template = handlebars.compile(source);

    const appliedCandidatesLink =
      `${process.env.FRONTEND_APP_URL}/uniqueworld/applied-candidates/${jobOpeningId}`;

    const { admins, others } = await resolveRecipientsAndMasking(emailTo);

    const sendVersion = async (recipients, isMasked) => {
      const mobileToSend = isMasked ? maskPhone(candidate?.mobile) : candidate?.mobile;
      const emailToSend = isMasked ? maskEmail(candidate?.email) : candidate?.email;
      const replacements = {
        jobTitle: jobTitle || "a position matching your requirements",
        candidateName: candidateName,
        companyowner: client?.companyowner || "Hiring Team",
        companyName: client?.companyName || "Your Organization",
        candidateMobile: mobileToSend || "Not provided",
        candidateEmail: emailToSend || "Not provided",
        candidateResume: candidate?.resume || "#",
        canDownloadResume: canDownloadResume,
        remainingDownloads: remainingDownloads || 0,
        appliedCandidatesLink: appliedCandidatesLink,
      };

      const htmlToSend = template(withBrand(replacements));
      await transporter.sendMail({
        from: FROM_EMAIL,
        bcc: recipients,
        subject: `${client?.companyName || "Recruitment Update"} - I’m ${candidateName} applying for your Job Opening role: ${jobTitle || "Position"}`,
        html: htmlToSend,
      });
    };

    if (admins.length > 0) await sendVersion(admins, false);
    if (others.length > 0) await sendVersion(others, true);
  } catch (err) {
    console.info("----------------------------");
    console.info("sendCandidateJobApplyAlert error =>", err);
    console.info("----------------------------");
  }
};

exports.sendNewJobOpeningAlert = async (candidate, emailTo, jobOpening) => {
  const subject = `Exciting New Opportunity: ${jobOpening?.designation || "New Job Opening"} at Unique World!`;
  const frontendBase = String(
    process.env.FRONTEND_APP_URL ||
      "https://peachpuff-snail-327679.hostingersite.com"
  ).replace(/\/$/, "");
  const slug =
    String(
      candidate?.agencySlug ||
        candidate?.slug ||
        candidate?.agency?.slug ||
        "uniqueworld"
    ).trim() || "uniqueworld";
  const jobId = String(jobOpening?.id || jobOpening?._id || "").trim();
  const jobPath = jobId
    ? `/${slug}/jobmatches?jobId=${encodeURIComponent(jobId)}`
    : `/${slug}/jobmatches`;
  // Candidate must login first, then land on Job Matches with this job open
  const jobDetailsLink = `${frontendBase}/login?redirect=${encodeURIComponent(
    jobPath
  )}`;

  const formatSalary = (salary) => {
    if (salary == null) return "To be discussed";
    return `₹${new Intl.NumberFormat("en-IN").format(salary)}`;
  };

  // readEmailTemplate() — plain regex replace, cannot handle {{brand.x}} dot notation --
  // sendEmailWrapper() — used `to:` instead of `bcc:`, inconsistent with all other functions --
  // handlebars.compile + withBrand() so logo, colors, name all inject correctly --
  const filePath = path.join(__dirname, "./tamplates/newJobOpeningAlert.html");
  const source = fs.readFileSync(filePath, "utf-8").toString();
  const template = handlebars.compile(source);

  const htmlToSend = template(withBrand({
    candidateFirstName: safeName(candidate?.firstname, candidate?.lastname, "Valued Candidate"),
    jobTitle: jobOpening?.designation || "a new position",
    jobLocation: jobOpening?.jobLocation || "Not specified",
    minExperienceYears: jobOpening?.minExperienceYears != null ? `${jobOpening.minExperienceYears}` : "Not specified",
    salaryRangeStart: formatSalary(jobOpening?.salaryRangeStart),
    salaryRangeEnd: formatSalary(jobOpening?.salaryRangeEnd),
    jobDetailsLink: jobDetailsLink,
    currentYear: new Date().getFullYear(),
  }));

  // sendEmailWrapper(emailTo, subject, htmlContent) --
  // transporter.sendMail with bcc: consistent with all other mail functions --
  await transporter.sendMail({
    from: FROM_EMAIL,
    bcc: emailTo,
    subject: subject,
    html: htmlToSend,
  });
};