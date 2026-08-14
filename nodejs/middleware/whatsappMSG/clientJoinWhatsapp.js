const {
  sendClientWelcomeWhatsapp,
} = require("./welcomeMessage");

/**
 * New client add → Super Admin Msg API configs (same list as candidate; map placeholders in each cURL).
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
