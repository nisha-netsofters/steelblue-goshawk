const User = require("../models/User");
const { upload_Data } = require("../middleware/multer");
const { fileUpload } = require("../middleware/contentful");
const jwt = require("jsonwebtoken");
const { sendEmailLink } = require("../middleware/Emails/email");
const { upload } = require("../middleware/awsS3");
const Subscriptions = require("../models/Subscriptions");
const Payments = require("../models/Payments");
const Plans = require("../models/Plan");
const PlanFeatures = require("../models/PlanFeatures");
const Clients = require("../models/Clients");
const { enqueueEmailJob } = require("../mq/emailProducer");

exports.createUser = async (req, res) => {
  let user = req.body;
  if (req?.files?.image) {
    let resp = await awsUploadFiles(req.files.image);
    user.image = `${resp.url}`;
  }
  try {
    const userdata = await User.query().insert(user);
    res.json(userdata);
  } catch (err) {
    res.json({ msg: err });
  }
};

exports.forgotPasswordEmailLink = async (req, res) => {
  let user = req.body;
  if (user?.email !== undefined) {
    await User.query()
      .select("*")
      .withGraphFetched("role")
      .where("email", user.email)
      .first()
      .then((response) => {
        if (response === undefined) {
          res.json({ msg: "user does'nt exist" });
        } else if (response?.role?.name === "Client") {
          res.json({ msg: "Client can't change the password" });
        } else {
          res.json({ msg: "success" });
          enqueueEmailJob("forgotPassword", { user: response });
        }
      });
  } else {
    enqueueEmailJob("forgotPassword", { user });
  }
};

exports.resetPassword = async (req, res) => {
  const { id } = req.query;
  const { password } = req.body;
  await User.query()
    .update({ password })
    .where("id", id)
    .then((resp) => res.json({ msg: "success" }));
};

exports.passwordUpdate = async (req, res) => {
  const { id } = req.params;
  const { password, currentPassword } = req.body;
  const userData = await User.query().select("*").where("id", id);
  if (userData[0]?.password == currentPassword) {
    try {
      await User.query()
        .update({ password })
        .where("id", id)
        .then((resp) => res.json({ msg: "success" }));
    } catch (err) {
      console.log("password update", err);
    }
  } else {
    res.json({ msg: "Current password doesn't match" });
  }
};

exports.userUpdate = async (req, res) => {
  const user = req.body;
  const id = req.params.id;
  if (req?.files?.image) {
    let resp = await awsUploadFiles(req.files.image);
    user.image = `${resp.url}`;
  }
  await User.query()
    .update(user)
    .where("id", id)
    .then(async (resp) => {
      const prevPaymentData = await Clients.query().findOne({
        userId: user?.id,
      });
      const paymentObj = {
        userId: user?.id,
        paymentId: `${Date.now()}${user?.mobile?.slice(0, 3)}`,
        entity: "payment",
        amount: 3999,
        status: "captured",
        currency: "INR",
        order_id: null,
        invoice_id: null,
        method: "cash",
        captured: true,
        card_id: null,
        email: user?.email,
        contact: user?.mobile,
        notes: {
          customerId: prevPaymentData?.razorpay_custId,
          userId: user?.id,
          clientId: prevPaymentData?.id,
          planId: user?.planId,
        },
        fee: 0,
        tax: 0,
        error_code: null,
        error_description: null,
        error_source: null,
        error_step: null,
        error_reason: null,
        customerId: prevPaymentData?.razorpay_custId,
      };
      const paymentData = await Payments.query().insertAndFetch(paymentObj);
      const planData = await Plans.query().findById(user?.planId);
      if (planData !== undefined) {
        const planFeaturesData = await PlanFeatures.query().findById(
          planData?.plan_feature_id
        );

        const subscriptionObj = {
          planId: user?.planId,
          userId: user?.id,
          payment_id: paymentData?.id,
          active_plan: true,
          resume_download_count: -1,
          interview_request_count: -1,
          timeDuration: planFeaturesData?.validate_days,
        };
        const subsciptionData = await Subscriptions.query().insertAndFetch(
          subscriptionObj
        );

        await User.query()
          .update({ subscriptionId: subsciptionData?.id })
          .where("id", user?.id);
      }
      res.json({ isSuccess: true, msg: "success" });
    })
    .catch((err) => {
      console.info("--------------------");
      console.info("err", err);
      console.info("--------------------");
      if (err && err?.constraint === "users_email_unique") {
        res.json({ isSuccess: false, msg: "Email alreday exists." });
      }
      console.log(JSON.stringify(err));
    });
};

exports.userDelete = async (req, res) => {
  try {
    const id = req.params.id;
    await User.query().deleteById(id);
    res.json({ msg: "success" });
  } catch (err) {
    console.log("user delete", err);
  }
};

exports.detailsUser = async (req, res) => {
  try {
    let userData = await User.query()
      .select("*")
      .where("id", req.params.id)
      .withGraphFetched("role")
      .withGraphFetched("clients.industries_relation.industries")
      .withGraphFetched("clients.jobCategory_relation.jobCategory")
      .first();
    res.json({ data: userData });
  } catch (err) {
    res.json({ msg: err });
  }
};

exports.getUsers = async (req, res) => {
  try {
    let { page, perPage } = req.query;
    page -= 1;
    const userFilter = req.body;
    const filters = await User.query()
      .page(page, perPage)
      .withGraphFetched("subscription.plan.planFeature")
      .where((builder) => {
        for (const key in userFilter) {
          if (key == "roleId") {
            builder.andWhere(key, `${userFilter[key]}`);
          } else {
            builder.andWhere(key, "ilike", `%${userFilter[key]}%`);
          }
        }
      })
      .orderBy("created_at", "desc")
      .withGraphFetched("role")
      .withGraphFetched("clients")
      .modifyGraph("clients", (builder) => {
        builder.select(["companyName"]);
      })
    res.json(filters);
  } catch (err) {
    console.log("dataa users filter errr", err);
    res.json({ msg: err });
  }
};

// Team leader, Recruiter, Admin
exports.getUsersRoleWise = async (req, res) => {
  const role = req.query.name;
  let select = "*";
  let name = ["Admin", "Recruiter", "Team Leader"];

  if (role === "Recruiter") {
    name = ["Recruiter"];
    select = ["id", "name"];
  }
  try {
    let users = await User.query()
      .whereExists(User.relatedQuery("role").whereIn("name", name))
      .select(select);
    res.json(users);
  } catch (err) {
    console.log("dataa users role wise errr", err);
    res.json({ msg: err });
  }
};

exports.getUserData = async (req, res) => {
  try {
    const id = req.params.id;
    if (id) {
      await User.query()
        .findById(id)
        .withGraphFetched("role")
        .withGraphFetched("clients.industries_relation.industries")
        .withGraphFetched("clients.jobCategory_relation.jobCategory")
        .withGraphFetched("clients.jobCategories")
        .withGraphFetched("subscription.plan.planFeature")
        .then(async (result) => {
          res.json(result);
        });
    } else {
      res.json({ msg: "admin" });
    }
  } catch (err) {
    console.log("dataa users filter errr", err);
    res.json({ msg: err });
  }
};

exports.createFreeSubscription = async (req, res) => {
  try {
    const id = req.params.id;
    const getFreeplanData = await Plans.query()
      .withGraphFetched("planFeature")
      .findOne("planName", "free");

    const allClients = await User.query()
      .withGraphJoined("role")
      .where("role.name", "Client");
    const subscriptionDetails = [];
    // for (const client of allClients) {
    const subscription = await Subscriptions.query().insert({
      userId: id,
      planId: getFreeplanData.id,
      resume_download_count: 0, // resume_download_count: subscription.resume_download_count + 1
    });
    subscriptionDetails.push({
      id: id,
      subscriptionId: subscription.id,
    });
    // }
    const userData = await User.query()
      .upsertGraphAndFetch(subscriptionDetails, {
        relate: true,
      })
      .withGraphFetched("subscription.plan.planFeature");
    res.status(200).json(userData);
  } catch (error) {
    console.info("----------------------------");
    console.info("error =>", error);
    console.info("----------------------------");
  }
};
