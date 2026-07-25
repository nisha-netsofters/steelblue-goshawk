const amqplib = require("amqplib");

// Simple shared RabbitMQ connection/channel with lazy init
let connection = null;
let channel = null;

async function getChannel() {
  if (channel) return channel;

  const url = process.env.RABBITMQ_URL || "amqp://localhost";
  connection = await amqplib.connect(url);
  channel = await connection.createChannel();

  // previously there were no event listeners here, so if RabbitMQ disconnected
  // previously there were no event listeners here, so if RabbitMQ disconnected
  // the stale dead channel was returned forever causing all queued emails to silently fail.
  // Now we reset connection + channel on error/close so next publish reconnects cleanly.
  connection.on("error", (err) => {
    console.error("RabbitMQ connection error =>", err);
    connection = null;
    channel = null;
  });
  connection.on("close", () => {
    console.warn("RabbitMQ connection closed, will reconnect on next publish");
    connection = null;
    channel = null;
  });
  return channel;
}

/**
 * Publish a JSON message to a queue.
 * Fails gracefully (logs error) so API requests don't crash
 * if RabbitMQ is temporarily unavailable.
 */
async function publishToQueue(queueName, message) {
  try {
    const ch = await getChannel();
    await ch.assertQueue(queueName, { durable: true });
    ch.sendToQueue(queueName, Buffer.from(JSON.stringify(message)), {
      persistent: true,
    });
  } catch (err) {
    console.error("RabbitMQ publish error =>", err);
  }
}

module.exports = {
  publishToQueue,
};


