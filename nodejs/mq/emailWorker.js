require("dotenv").config();

const amqplib = require("amqplib");

const {
  sendEmailLink,
  sendInterviewRequestEmail,
  sendInterviewRequestEmailforUniqueworld,
  sendcandidateRegistrationSuccessfully,
  sendClientApproval,
  newClientAdded,
  newCandidatewelcomeEmail,
  sendtoAllClientmailAdded,
  sendBulkMail,
  paymentSuccessfulMail,
  AddAgencyMail,
  sendTomatchIndustriesClients,
  deactivationMailToAgency,
  deactivationMailToDhaval,
  sendNewJobOpeningAlert,
  sendCandidateJobApplyAlert,
} = require("../middleware/Emails/email");

const EMAIL_QUEUE = process.env.RABBITMQ_EMAIL_QUEUE || "email_jobs";

async function startWorker() {
  const url = process.env.RABBITMQ_URL || "amqp://localhost";
  const connection = await amqplib.connect(url);
  const channel = await connection.createChannel();

  await channel.assertQueue(EMAIL_QUEUE, { durable: true });
  console.log(`📥 Email worker listening on queue: ${EMAIL_QUEUE}`);

  channel.consume(
    EMAIL_QUEUE,
    async (msg) => {
      if (!msg) return;

      try {
        const content = JSON.parse(msg.content.toString());
        const { type, payload } = content || {};

        switch (type) {
          case "forgotPassword":
            await sendEmailLink(payload.user);
            break;
          case "candidateRegistrationSuccess":
            await sendcandidateRegistrationSuccessfully(
              payload.candidate,
              payload.emailTo,
              payload.companyName,
              payload.companyowner
            );
            break;
          case "candidateWelcome":
            await newCandidatewelcomeEmail(
              payload.candidate,
              payload.agencyName
            );
            break;
          case "candidateLoginCredentials":
            // keep using existing helper
            await require("../middleware/Emails/email").sendCandidateLoginCredentials(
              payload.candidate,
              payload.emailTo,
              payload.password
            );
            break;
          case "clientApproval":
            await sendClientApproval(payload.client, payload.agency);
            break;
          case "newClientAdded":
            await newClientAdded(payload.client, payload.emailTo);
            break;
          case "bulkCandidatesToClients":
            await sendtoAllClientmailAdded(
              payload.clientsEmail,
              payload.candidate,
              payload.agencyName,
              payload.jobTitle
            );
            break;
          case "bulkMail":
            await sendBulkMail(payload.obj);
            break;
          case "paymentSuccessful":
            await paymentSuccessfulMail(
              payload.clientData,
              payload.paymentData,
              payload.planData,
              payload.agencyName
            );
            break;
          case "agencyCreated":
            await AddAgencyMail(
              payload.name,
              payload.email,
              payload.password
            );
            break;
          case "industryMatchClients":
            await sendTomatchIndustriesClients(
              payload.clientsEmail,
              payload.industries
            );
            break;
          case "agencyDeactivationAgency":
            await deactivationMailToAgency(
              payload.agencyownername,
              payload.email
            );
            break;
          case "agencyDeactivationDhaval":
            await deactivationMailToDhaval(
              payload.agencyownername,
              payload.expireDate
            );
            break;
          case "interviewRequestUniqueworld":
            await sendInterviewRequestEmailforUniqueworld(
              payload.client,
              payload.candidate,
              payload.emailTo
            );
            break;
          case "interviewRequest":
            await sendInterviewRequestEmail(
              payload.client,
              payload.candidate,
              payload.emailTo
            );
            break;
          case "newJobOpeningAlert":
            await sendNewJobOpeningAlert(
              payload.candidate,
              payload.emailTo,
              payload.jobOpening
            );
            break;
          case "candidateJobApplyAlert":
            await sendCandidateJobApplyAlert(
              payload.client,
              payload.candidate,
              payload.jobTitle,
              payload.emailTo,
              payload.jobOpeningId
            );
            break;
          default:
            console.warn("Unknown email job type:", type);
        }
        // } finally { channel.ack(msg); } — ack ran even on failure, permanently deleting the message --
        // ack only on success inside try, nack in catch to requeue failed messages for retry --
        channel.ack(msg);
      } catch (err) {
        console.error("Email worker job error =>", err);
        // Don't requeue parse errors or unknown types — they will loop forever
        const isPermanentError =
          err instanceof SyntaxError || // bad JSON
          (err.message && err.message.includes("Unknown email job type")); // unhandled type
        if (isPermanentError) {
          console.error("Permanent error, discarding message (dead-letter):", err.message);
          channel.nack(msg, false, false); // discard, do not requeue
        } else {
          channel.nack(msg, false, true); // transient error, requeue for retry
        }
      }
    },
    { noAck: false }
  );
}

if (require.main === module) {
  startWorker().catch((err) => {
    console.error("Email worker fatal error =>", err);
    process.exit(1);
  });
}

module.exports = { startWorker };