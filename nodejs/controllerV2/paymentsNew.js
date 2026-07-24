require("dotenv").config();
const { v4: uuid } = require("uuid");
const crypto = require("crypto");
const PhonePe = require("../models-v2/phonePe");
const Orderofpayments = require("../models-v2/orderOfPayments_Mongoose");
const axios = require("axios");
const Subscriptions = require("../models-v2/subscriptions_Mongoose");
const { default: mongoose } = require("mongoose");
const Users = require("../models-v2/users_Mongoose");
const Subscription = require("../models-v2/subscriptions_Mongoose");

const merchantId = process.env.PAYMENT_MERCHANTID;
const salt_key = process.env.PAYMENT_SALT_KEY;
const keyIndex = process.env.PAYMENT_SALT_INDEX;
const API_BASE_URL = process.env.PAYMENT_HOST_URL;
const redirectUrlendpoint = `${process.env.PAYMENT_FRONTEND_REDIRECT_URL_ENDPOINT}/`;
const callbackUrl = `${process.env.PAYMENT_SERVER_REDIRECT_URL}`;
const redirectUrlmailUrl = process.env.PAYMENT_FRONTEND_REDIRECT_MAIN_URL;

exports.paymentCreate = async (req, res) => {
  //   console.log("-------------------");
  // console.log("req.body", req.body);
  // console.log("req.user", req?.user);
  // console.log("-------------------");
  try {
    const uuidforpayment = uuid();
    // const merchantTransactionId = `PT${req.user?.id}`;
    const merchantTransactionId = `PT${uuidforpayment}`;
    // console.info("-------------------------------");
    // console.info("merchantId => ", merchantId);
    // console.info("-------------------------------");
    const redirectUrl = `${redirectUrlmailUrl}/${req.body.slug}${redirectUrlendpoint}${merchantTransactionId}`;
    const dataForOrderPayment = {
      merchantId,
      merchantTransactionId,
      // amount: 1 * 100,
      amount: Number(Number(req?.body?.totalAmountWithTax) * 100),
      name: req?.user?.name,
      email: req?.user?.email,
      merchantUserId: req?.user?.id,
      redirectUrl: redirectUrl,
      callbackUrl: callbackUrl,
      redirectMode: "REDIRECT",
      paymentInstrument: {
        type: "PAY_PAGE",
      },
      // mobileNumber: "9825600441",
      mobileNumber: req?.body?.Mobilenumber,
    };

    const data = {
      // merchantId,
      merchantTransactionId,
      // amount: 1 * 100,
      agencyId: req?.user?.agencyId || req?.headers["agencyid"],
      userId: req?.user?.id || req?.headers?.userid,
      tax: req?.body?.tax,
      TotalAmount: req?.body?.totalAmountWithTax,
      pincode: req?.body?.pincode,
      gst: req?.body?.gst,
      // planbyid: req?.body?.planbyid,
      address: req?.body?.address,
      Company: req?.body?.Company,
      lastname: req?.body?.lastname,
      firstname: req?.body?.firstname,
      mobileNumber: req?.body?.Mobilenumber,
      pannumber: req?.body?.pannumber,
      city: req?.body?.city,
      state: req?.body?.state,
      email: req?.user?.email,
      merchantUserId: req?.user?.id || req.headers.userid,
      redirectUrl: redirectUrl,
      callbackUrl: callbackUrl,
      redirectMode: "REDIRECT",
      paymentInstrument: {
        type: "PAY_PAGE",
      },
    };

    const orderofpayment = await Orderofpayments.create({
      id: uuidforpayment,
      paymentMethod: "Online",
      agencyId: req?.user?.agencyId || req.headers["agencyid"],
      // subscriptionId: req?.body?.subscriptionId,
      planId: req?.body?.planId,
      ...data,
    });
    const payload = JSON.stringify(dataForOrderPayment);
    const payloadMain = Buffer.from(payload).toString("base64");
    const string = payloadMain + "/pg/v1/pay" + salt_key;
    const sha256 = crypto.createHash("sha256").update(string).digest("hex");
    const checksum = sha256 + "###" + keyIndex;

    const options = {
      method: "POST",
      url: `${API_BASE_URL}/pg/v1/pay`,
      headers: {
        accept: "application/json",
        "Content-Type": "application/json",
        "X-VERIFY": checksum,
        "X-CALLBACK-URL": callbackUrl,
      },
      data: {
        request: payloadMain,
        callbackUrl: callbackUrl,
      },
    };

    try {
      let resp = await axios.request(options);
      await Orderofpayments.updateOne(
        { id: orderofpayment?.id },
        {
          $set: {
            paymentcreateresponce: resp?.data?.data,
          },
        }
      );
      res.status(200).send({
        data: resp?.data?.data?.instrumentResponse?.redirectInfo?.url || "",
        message: "Payment create",
      });
    } catch (error) {
      console.log("error", error);
      res.status(200).send({
        error: error || "",
        message: "Something failed",
      });
      // console.log("data", data);
      console.log("-------------------");
      console.log("create error");
    }
  } catch (err) {
    console.log("err main", err);
  }
};

exports.paymentStatus = async (req, res) => {
  try {
    // let resp = await PhonePe.create({ phonePe: req.body });
    const merchantTransactionId = req?.body?.transactionId;
    const agencyId = req.headers["agencyid"];
    const string =
      `/pg/v1/status/${merchantId}/${merchantTransactionId}` + salt_key;
    const sha256 = crypto.createHash("sha256").update(string).digest("hex");
    const checksum = sha256 + "###" + keyIndex;

    const options = {
      method: "GET",
      url: `${API_BASE_URL}/pg/v1/status/${merchantId}/${merchantTransactionId}`,
      headers: {
        accept: "application/json",
        "Content-Type": "application/json",
        "X-VERIFY": checksum,
        "X-MERCHANT-ID": `${merchantId}`,
      },
    };

    let resp = await axios?.request(options);

    if (resp?.data?.code == "PAYMENT_SUCCESS") {
      const userdetails = await Orderofpayments.findOne({
        merchantTransactionId: merchantTransactionId,
      });
      await Subscription?.updateOne(
        { id: userdetails?.subscriptionId },
        { $set: { agencyId: agencyId } }
      );
      if (
        userdetails?.subscriptionId !== "" ||
        userdetails?.subscriptionId !== null ||
        userdetails?.subscriptionId !== undefined
      ) {
        return res.status(200).send({
          data: resp?.data,
          subscriptionId: userdetails?.subscriptionId,
        });
      }
    }

    res.status(200).send({
      data: resp?.data,
    });
  } catch (err) {
    console.log("-------------------");
    console.log("error phonePe", err);
    console.log("status error");
  }
};

exports.serverToServerCall = async (req, res) => {
  try {
    const response = req.body.response;
    const decodedResponse = Buffer.from(response, "base64")?.toString("utf-8");
    const parsedResponse = JSON?.parse(decodedResponse);

    const lenght = await Orderofpayments.countDocuments();
    console.log("server to server call");
    if (parsedResponse?.code == "PAYMENT_SUCCESS") {
      let objectId = new mongoose.Types.ObjectId();
      let userdetails = await Orderofpayments.aggregate([
        {
          $match: {
            merchantTransactionId: parsedResponse?.data?.merchantTransactionId,
          },
        },
        {
          $lookup: {
            from: "plans",
            localField: "planId",
            foreignField: "id",
            as: "plan",
            pipeline: [
              {
                $lookup: {
                  from: "plan_features",
                  localField: "plan_feature_id",
                  foreignField: "id",
                  as: "planFeature",
                },
              },
              {
                $addFields: {
                  planFeature: { $arrayElemAt: ["$planFeature", 0] },
                },
              },
            ],
          },
        },
        {
          $addFields: {
            plan: { $arrayElemAt: ["$plan", 0] },
          },
        },
      ]);

      let subscriptionObj = {
        id: objectId,
        _id: objectId,
        planId: userdetails[0]?.planId,
        userId: userdetails[0]?.merchantUserId,
        payment_id: parsedResponse?.data?.merchantTransactionId,
        active_plan: true,
        resume_download_count: "-1",
        interview_request_count: "-1",
        timeDuration: userdetails[0]?.plan?.planFeature?.validate_days,
      };
      const subsciptionData = await Subscriptions.create(subscriptionObj);

      await Users.updateOne(
        {
          id: userdetails[0]?.merchantUserId,
        },
        {
          $set: {
            subscriptionId: subsciptionData?.id,
          },
        }
      );
      await Orderofpayments.updateOne(
        { merchantTransactionId: parsedResponse?.data?.merchantTransactionId },
        {
          $set: {
            invoicenumber: lenght + 1,
            servertoserverRes: parsedResponse?.data,
            subscriptionId: subsciptionData?.id,
          },
        }
      );
      return res.status(200).send({
        response: parsedResponse,
        subsciptionData,
      });
    }

    res.status(200).send({
      response: parsedResponse,
    });
  } catch (err) {
    console.log("-------------------");
    console.log("error phonePe", err);
    console.log("-------------------");
  }
};

exports.getOrderDetails = async (req, res) => {
  try {
    const merchantTransactionId = req?.body?.transactionId;
    const order = await Orderofpayments.aggregate([
      {
        $match: { merchantTransactionId: merchantTransactionId },
      },
      {
        $lookup: {
          from: "users",
          localField: "merchantUserId",
          foreignField: "id",
          as: "users",
          pipeline: [
            {
              $project: { password: 0 },
            },
          ],
        },
      },
      {
        $addFields: {
          users: { $arrayElemAt: ["$users", 0] },
        },
      },
      {
        $lookup: {
          from: "agency",
          localField: "agencyId",
          foreignField: "id",
          as: "agency",
          pipeline: [
            {
              $project: { password: 0 },
            },
          ],
        },
      },
      {
        $addFields: {
          agency: { $arrayElemAt: ["$agency", 0] },
        },
      },
      {
        $lookup: {
          from: "plans",
          localField: "planId",
          foreignField: "id",
          as: "plans",
          pipeline: [
            {
              $lookup: {
                from: "plan_features",
                localField: "plan_feature_id",
                foreignField: "id",
                as: "planFeature",
              },
            },
            {
              $addFields: {
                planFeature: { $arrayElemAt: ["$planFeature", 0] },
              },
            },
          ],
        },
      },
      {
        $addFields: {
          plans: { $arrayElemAt: ["$plans", 0] },
        },
      },
    ]);
    if (order?.length > 0) {
      res.status(200).send({
        response: order[0],
      });
    } else {
      res.send({
        msg: "merchantTransactionId is invalid",
      });
    }
  } catch (err) {
    console.log("-------------------");
    console.log("error phonePe", err);
    console.log("-------------------");
  }
};
