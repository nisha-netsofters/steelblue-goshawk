const {
  sendClientWelcomeWhatsapp,
} = require("./welcomeMessage");

/**
 * New client add → Super Admin Msg API configs with audience = client.
 */
exports.sendClientJoinWhatsapp = async (client) => {
  try {
    return await sendClientWelcomeWhatsapp(client);
  } catch (err) {
    console.info(
      "sendClientJoinWhatsapp error =>",
      err?.message || err
    );
    return { success: false, error: err?.message || "send failed" };
  }
};
