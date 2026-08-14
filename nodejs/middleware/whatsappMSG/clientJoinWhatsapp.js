const {
  sendClientWelcomeWhatsapp,
  sendPlanAssignWhatsapp: sendPlanAssignWhatsappMessage,
} = require("./welcomeMessage");
const Clients = require("../../models-v2/clients_Mongoose");
const Users = require("../../models-v2/users_Mongoose");

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

/**
 * Plan assign / subscription create → Super Admin Plan Assign cURL only.
 */
exports.sendPlanAssignWhatsapp = async (userId) => {
  try {
    if (!userId) {
      return { skipped: true, reason: "no_user_id" };
    }
    const client = await Clients.findOne({ userId });
    const user = await Users.findOne({ id: userId });
    const clientObj =
      client && typeof client.toObject === "function"
        ? client.toObject()
        : client || {};
    const userObj =
      user && typeof user.toObject === "function" ? user.toObject() : user || {};
    return await sendPlanAssignWhatsappMessage({
      ...clientObj,
      mobile: clientObj.mobile || userObj.mobile,
      email: clientObj.email || userObj.email,
      companyowner: clientObj.companyowner || userObj.name,
      companyName: clientObj.companyName,
      name: userObj.name || clientObj.companyowner,
      agencyId: clientObj.agencyId || userObj.agencyId,
    });
  } catch (err) {
    console.info(
      "sendPlanAssignWhatsapp error =>",
      err?.message || err
    );
    return { success: false, error: err?.message || "send failed" };
  }
};
