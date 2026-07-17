const Payments = require("../models-v2/payments_Mongoose");
const Razorpay = require("razorpay");
const fs = require("fs");
const Clients = require("../models-v2/clients_Mongoose");
const Subscriptions = require("../models-v2/subscriptions_Mongoose");
const Plans = require("../models-v2/plans_Mongoose");
const PlanFeatures = require("../models-v2/planFeatures_Mongoose");
const User = require("../models-v2/users_Mongoose");
const { paymentSuccessfulMail } = require("../middleware/Emails/email");
const { enqueueEmailJob } = require("../mq/emailProducer");
const Agency = require("../models-v2/agency_Mongooes");
const instance = new Razorpay({
  key_id: process.env.RAZOR_PAY_KEY_ID,
  key_secret: process.env.RAZOR_PAY_KEY_SECRET,
});

exports.getAllPayments = async (req, res) => {
  try {
    const payments = await Payments.aggregate([
      {
        $sort: { createdAt: -1 },
      },
    ]);
    res.status(200).json(payments);
  } catch (error) {
    console.info("----------------------------");
    console.info("error =>", error);
    console.info("----------------------------");
    res.status(500).json;
  }
};

exports.createRazorpayOrder = async (req, res) => {
  try {
    const options = req.body;
    const client = await Clients.find({ id: options?.notes?.clientId });
    let razorpay_custId = client?.razorpay_custId;
    if (client.razorpay_custId == null) {
      const razorpay_customer = await instance.customers.create({
        name: client?.companyowner,
        contact: client?.mobile,
        email: client?.email,
        notes: {
          userId: client?.userId,
          companyName: client?.companyName,
          city: client?.city,
        },
      });
      razorpay_custId = razorpay_customer?.id;
      await Clients.updateOne(
        { id: client?.id },
        { $set: { razorpay_custId: razorpay_customer?.id } }
      );
      // .patch({ razorpay_custId: razorpay_customer?.id })
      // .findById(client?.id);
    }
    await instance.orders.create(
      { ...options, customer_id: razorpay_custId },
      async function (err, order) {
        if (err) {
          return res.status(500).json({
            message: "Something Went Wrong",
          });
        }
        return res.status(200).json(order);
      }
    );
  } catch (err) {
    console.info("----------------------------");
    console.info("err =>", err);
    console.info("----------------------------");
    return res.status(500).json({
      message: "Something Went Wrong",
    });
  }
};

exports.capturePayment = async (req, res) => {
  try {
    const { paymentId, amount, currency, userId, planId } = req.body;
    await instance.payments
      .capture(paymentId, amount, currency)
      .then((result) => {
        res.status(200).json(result);
      });
  } catch (err) {
    console.info("----------------------------");
    console.info("err =>", err);
    console.info("----------------------------");
    return res.status(500).json({
      message: "Something Went Wrong",
    });
  }
};

exports.webHookPayment = async (req, res) => {
  try {
    const object = Object.assign({}, req.body);

    if (object?.payload?.payment.entity) {
      const data = object?.payload?.payment.entity;
      const paymentObj = {
        userId: data?.notes?.userId,
        paymentId: data?.id,
        entity: data?.entity,
        amount: data?.amount / 100,
        status: data?.status,
        currency: data?.currency,
        order_id: data?.order_id,
        invoice_id: data?.invoice_id,
        method: data?.method,
        captured: data?.captured,
        card_id: data?.card_id,
        email: data?.email,
        contact: data?.contact,
        notes: data?.notes,
        fee: data?.fee,
        tax: data?.tax,
        error_code: data?.error_code,
        error_description: data?.error_description,
        error_source: data?.error_source,
        error_step: data?.error_step,
        error_reason: data?.error_reason,
        customerId: data?.notes?.customerId,
      };
      const paymentData = await Payments.create(paymentObj);
      const planData = await Plans.find({ id: data?.notes?.planId });
      const planFeaturesData = await PlanFeatures.find({
        id: planData?.plan_feature_id,
      });

      const subscriptionObj = {
        planId: data?.notes?.planId,
        userId: data?.notes?.userId,
        payment_id: paymentData?.id,
        active_plan: true,
        resume_download_count: -1,
        interview_request_count: -1,
        timeDuration: planFeaturesData?.validate_days,
      };
      const subsciptionData = await Subscriptions.create(subscriptionObj);
      await User.update(
        { id: data?.notes?.userId },
        { subscriptionId: subsciptionData?.id }
      );
    }
    return res.json({
      status: "ok",
    });
  } catch (err) {
    console.info("----------------------------");
    console.info("err =>", err);
    console.info("----------------------------");
    return res.status(500).json({
      message: "Something Went Wrong",
    });
  }
};

exports.webHookOrder = async (req, res) => {
  try {
    await instance.webhooks.all(10, "Hsc4TsPDHYSs2D");
    res.status(200).json(req.body);
  } catch (err) {
    console.info("----------------------------");
    console.info("err =>", err);
    console.info("----------------------------");
    return res.status(500).json({
      message: "Something Went Wrong",
    });
  }
};
exports.paymentMail = async (req, res) => {
  try {
    const id = req.params.id;
    const clientData = await Clients.findOne({ id: id });
    const agencyId = req.headers["agencyid"];
    const agency = await Agency.findOne({ id: agencyId });
    let paymentData = await Payments.aggregate([
      {
        $sort: { createdAt: -1 },
      },
      { $match: { userId: clientData?.userId } },
      {
        $limit: 1,
      },
    ]);
    if (paymentData.length > 0) {
      paymentData = paymentData[0];
    }

    const notesObject = JSON.parse(paymentData?.notes);
    const planId = notesObject?.planId;

    let planData = await Plans.aggregate([
      {
        $match: { id: planId },
      },
      {
        $lookup: {
          from: "plan_features",
          localField: "plan_feature_id",
          foreignField: "id",
          as: "planFeature",
        },
      },
    ]);
    if (planData.length > 0) {
      planData = planData[0];
    }
    await enqueueEmailJob("paymentSuccessful", {
      clientData,
      paymentData,
      planData,
      agencyName: agency.name,
    });
    res.status(200).json({ msg: "success" });
  } catch (err) {
    console.info("----------------------------");
    console.info("err =>", err);
    console.info("----------------------------");
    return res.status(500).json({
      message: "Something Went Wrong",
    });
  }
};
