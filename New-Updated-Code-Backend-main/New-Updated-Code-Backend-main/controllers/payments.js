const Payments = require("../models/Payments");
const Razorpay = require("razorpay");
const fs = require("fs");
const Clients = require("../models/Clients");
const Subscriptions = require("../models/Subscriptions");
const Plans = require("../models/Plan");
const PlanFeatures = require("../models/PlanFeatures");
const User = require("../models/User");
const { paymentSuccessfulMail } = require("../middleware/Emails/email");
const { enqueueEmailJob } = require("../mq/emailProducer");

let razorpayInstance;
const getRazorpay = () => {
  if (!razorpayInstance) {
    const keyId = process.env.RAZOR_PAY_KEY_ID;
    const keySecret = process.env.RAZOR_PAY_KEY_SECRET;
    if (!keyId || !keySecret) {
      throw new Error("Razorpay is not configured");
    }
    razorpayInstance = new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    });
  }
  return razorpayInstance;
};

exports.getAllPayments = async (req, res) => {
  try {
    const payments = await Payments.query();
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

const client = await Clients.query().findById(options?.notes?.clientId)
let razorpay_custId = client?.razorpay_custId;
    if (client.razorpay_custId == null) {
    const razorpay_customer = await getRazorpay().customers.create({
      name: client?.companyowner,
      contact: client?.mobile,
      email: client?.email,
      notes: {
        userId: client?.userId,
        companyName: client?.companyName,
        city: client?.city
      }
    })
    razorpay_custId = razorpay_customer?.id
  await Clients.query().patch({razorpay_custId: razorpay_customer?.id}).findById(client?.id)
    } 
    await getRazorpay().orders.create({...options, customer_id: razorpay_custId}, async function (err, order) {
      if (err) {
        return res.status(500).json({
          message: "Something Went Wrong",
        });
      }
      return res.status(200).json(order);
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

exports.capturePayment = async (req, res) => {
  try {
    const { paymentId, amount, currency, userId, planId } = req.body;
    await getRazorpay().payments
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
        userId : data?.notes?.userId,
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
        customerId: data?.notes?.customerId
      }
      const paymentData =  await Payments.query().insertAndFetch(paymentObj)
      const planData = await Plans.query().findById(data?.notes?.planId)
      const planFeaturesData = await PlanFeatures.query().findById(planData?.plan_feature_id)
  
      const subscriptionObj = {
        planId : data?.notes?.planId,
        userId: data?.notes?.userId,
        payment_id: paymentData?.id,
        active_plan: true,
        resume_download_count: -1,
        interview_request_count: -1,
        timeDuration: planFeaturesData?.validate_days
      }
     const subsciptionData = await Subscriptions.query().insertAndFetch(subscriptionObj)
    await User.query().update({ subscriptionId: subsciptionData?.id }).where('id', data?.notes?.userId)
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
    await getRazorpay().webhooks.all(10, "Hsc4TsPDHYSs2D");
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
    const clientData = await Clients.query().findById(id)
    let paymentData = await Payments.query()
    .where("userId", "=", clientData?.userId)
    .orderBy("created_at", "desc")
    .first();

    const notesObject = JSON.parse(paymentData?.notes);
    const planId = notesObject?.planId;

    let planData = await Plans.query().findById(planId)
    .withGraphFetched('planFeature')
   await enqueueEmailJob("paymentSuccessful", {
     clientData,
     paymentData,
     planData,
     agencyName: "", // legacy path – template can ignore if not provided
   })
    res.status(200).json({msg: "success"});
  } catch (err) {
    console.info("----------------------------");
    console.info("err =>", err);
    console.info("----------------------------");
    return res.status(500).json({
      message: "Something Went Wrong",
    });
  }
};
