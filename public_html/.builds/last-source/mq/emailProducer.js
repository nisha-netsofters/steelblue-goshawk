const { publishToQueue } = require("./rabbit");

const EMAIL_QUEUE = process.env.RABBITMQ_EMAIL_QUEUE || "email_jobs";

async function enqueueEmailJob(type, payload) {
  await publishToQueue(EMAIL_QUEUE, { type, payload });
}

module.exports = {
  enqueueEmailJob,
};


