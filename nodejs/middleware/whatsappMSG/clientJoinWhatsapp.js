const {
  sendClientWelcomeWhatsapp,
  sendPlanAssignWhatsapp: sendPlanAssignWhatsappMessage,
} = require("./welcomeMessage");
const Clients = require("../../models-v2/clients_Mongoose");
const Users = require("../../models-v2/users_Mongoose");
const Subscription = require("../../models-v2/subscriptions_Mongoose");
const Plans = require("../../models-v2/plans_Mongoose");

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

    const subscription =
      (userObj.subscriptionId &&
        (await Subscription.findOne({ id: userObj.subscriptionId }))) ||
      (await Subscription.findOne({ userId }).sort({ createdAt: -1 }));
    const subObj =
      subscription && typeof subscription.toObject === "function"
        ? subscription.toObject()
        : subscription || {};
    const planId = userObj.planId || subObj.planId;
    const plan = planId ? await Plans.findOne({ id: planId }) : null;
    const planObj =
      plan && typeof plan.toObject === "function" ? plan.toObject() : plan || {};

    const duration = String(
      subObj.timeDuration || planObj.validate_days || ""
    ).trim();
    let planExpiry = "";
    const days = parseInt(duration, 10);
    if (days && !Number.isNaN(days)) {
      const start = subObj.createdAt ? new Date(subObj.createdAt) : new Date();
      start.setDate(start.getDate() + days);
      planExpiry = start.toLocaleDateString("en-IN");
    }

    return await sendPlanAssignWhatsappMessage({
      ...clientObj,
      mobile: clientObj.mobile || userObj.mobile,
      email: clientObj.email || userObj.email,
      companyowner: clientObj.companyowner || userObj.name,
      companyName: clientObj.companyName,
      name: userObj.name || clientObj.companyowner,
      agencyId: clientObj.agencyId || userObj.agencyId,
      planName: planObj.planName,
      planPrice: planObj.price,
      planDuration: duration,
      planExpiry,
      timeDuration: duration,
      plan: planObj,
      subscription: subObj,
    });
  } catch (err) {
    console.info(
      "sendPlanAssignWhatsapp error =>",
      err?.message || err
    );
    return { success: false, error: err?.message || "send failed" };
  }
};
