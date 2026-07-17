const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env") });
const fs = require("fs");
const handlebars = require("handlebars");
const nodemailer = require("nodemailer");

const BRAND = {
  name: process.env.BRAND_NAME || "Unique World Placement Services",
  primary: process.env.BRAND_PRIMARY || "#0f172a",
  accent: process.env.BRAND_ACCENT || "#2563eb",
  logoUrl:
    process.env.BRAND_LOGO_URL ||
    "https://unique-world-pro.s3.amazonaws.com/assets/1710753058939unique.0e90a6c9724ea8d30d0e.png",
  portalUrl: process.env.PORTAL_URL || "https://portal.uniqueworldjobs.com/login",
  supportEmail: process.env.SUPPORT_EMAIL || "uniqueworldjobs@gmail.com",
};
const withBrand = (obj = {}) => ({ brand: BRAND, ...obj });

const transporter = nodemailer.createTransport({
  host: process.env.ZEPTO_SMTP_HOST || "smtp.zeptomail.in",
  port: Number(process.env.ZEPTO_SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.ZEPTO_SMTP_USER,
    pass: process.env.ZEPTO_SMTP_PASS,
  },
  requireTLS: true,
  connectionTimeout: 10 * 60 * 1000,
});

const FROM_EMAIL =
  process.env.ZEPTO_FROM_EMAIL ||
  process.env.REACT_APP_USER ||
  "no-reply@your-verified-domain.com";

const testEmailRecipient = "test43123@yopmail.com"; // Replace with your test email address

const templatesDir = path.join(__dirname, "tamplates");

async function sendTestEmail(templateName, subject, replacements = {}) {
  try {
    const filePath = path.join(templatesDir, templateName);
    const source = fs.readFileSync(filePath, "utf-8").toString();
    const template = handlebars.compile(source);
    const htmlToSend = template(withBrand(replacements));

    await transporter.sendMail({
      from: FROM_EMAIL,
      to: testEmailRecipient,
      subject: `TEST: ${subject} - ${templateName}`,
      html: htmlToSend,
    });
    console.log(`Successfully sent test email for: ${templateName}`);
    return true;
  } catch (error) {
    console.error(`Error sending test email for ${templateName}:`, error);
    return false;
  }
}

async function testAllTemplates() {
  const templateFiles = fs.readdirSync(templatesDir).filter(file => file.endsWith(".html"));

  for (const templateFile of templateFiles) {
    // Basic replacements - you'll need to customize this for each template
    const defaultReplacements = {
      name: "Test User",
      email: "shahid4312@yopmail.com",
      link: "https://example.com/test-link",
      agencyName: "Test Agency",
      clientName: "Test Client",
      jobTitle: "Software Engineer",
      jobLocation: "Remote",
      minExperienceYears: "5",
      salaryRangeStart: "$100,000",
      salaryRangeEnd: "$120,000",
      currentYear: new Date().getFullYear(),
      password: "testpassword",
      mobile: "91******89", // Masked candidate phone (registration)
      candidateMobile: "98******12", // Masked candidate phone (interview/apply)
      clientMobile: "9123456789", // Unmasked client phone
    };

    // You would typically have specific dummy data for each template.
    // For now, we'll use a generic set of replacements.
    // In a real scenario, you'd have a switch statement or map here
    // to provide relevant data for each template.

    await sendTestEmail(templateFile, `Template: ${templateFile.replace(".html", "")}`, defaultReplacements);
  }
}

testAllTemplates();
