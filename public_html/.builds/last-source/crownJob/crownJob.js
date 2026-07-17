const Cronlogs = require("../models-v2/cronglogs_Mongooes");
const Candidates = require("../models-v2/candidates_Mongoose");
const Clients = require("../models-v2/clients_Mongoose");
const Subscriptions = require("../models-v2/subscriptions_Mongoose");
const { sendWhatsappMSG } = require("../middleware/whatsappMSG/whatsapp");
const { default: mongoose } = require("mongoose");
const _ = require("lodash");

exports.whatsappMsg = async (req, res) => {
  try {
    if (req?.query?.token === process.env.WHATSAPP_NOTIFICATION_CRON_PASSWORD) {
          console.log("-------------------");
          console.log("req.query", req.query);
          console.log("-------------------");
          console.log("whatsapp MSG CRON RUN");
          console.log("-------------------");
          let sentMessageCount = 0;
          let cronData = await startCronTab();

          if (cronData.isSuccess) {
            let candidates = await Candidates.aggregate([
              {
                $match: {
                  createdAt: { $gt: new Date("2024-01-20T00:00:28.978Z") },
                },
              },
              {
                $match: { whatsappMsg: false },
              },
            ]);
            let resp;
            if (candidates?.length) {
              for (let index = 0; index < candidates.length; index++) {
                resp = null;
                const element = candidates[index];
                if (element) {
                  const industriesId = [];
                  element?.industries_relation?.map((item) => {
                    industriesId.push(item?.id);
                  });
                  let clients = await Clients.aggregate([
                    {
                      $match: { action: "approved" },
                    },
                    {
                      $match: {
                        city: { $regex: new RegExp(element?.city, "i") },
                      },
                    },
                    {
                      $lookup: {
                        from: "agency",
                        localField: "agencyId",
                        foreignField: "id",
                        as: "agency",
                      },
                    },
                    {
                      $addFields: {
                        agency: { $arrayElemAt: ["$agency", 0] },
                      },
                    },
                    {
                      $match: {
                        "agency.email": {
                          $in: ["uniqueworldjobs@gmail.com"],
                        },
                      },
                    },
                    {
                      $lookup: {
                        from: "users",
                        localField: "userId",
                        foreignField: "id",
                        as: "users",
                      },
                    },
                    {
                      $addFields: {
                        users: { $arrayElemAt: ["$users", 0] },
                      },
                    },
                    {
                      $match: {
                        $or: [
                          {
                            "industries_relation.industriesId": {
                              $in: industriesId || [],
                            },
                          },
                          {
                            "jobCategory_relation.jobCategoryId": {
                              $in: [element?.professional?.jobCategoryId],
                            },
                          },
                        ],
                      },
                    },
                  ]);
                  console.log("clientsclientsclients", clients);
                  if (clients?.length > 0) {
                    for (let index = 0; index < clients.length; index++) {
                      const client = clients[index];
                      if (
                        clients[index]?.users &&
                        clients[index]?.users?.subscriptionId
                      ) {
                        const subscription = await Subscriptions.aggregate([
                          {
                            $match: {
                              id: clients[index]?.users?.subscriptionId,
                            },
                          },
                          {
                            $lookup: {
                              from: "plan",
                              localField: "planId",
                              foreignField: "id",
                              as: "plan",
                            },
                          },
                          {
                            $addFields: {
                              plan: { $arrayElemAt: ["$plan", 0] },
                            },
                          },
                        ]);
                        console.log("subscriptionbbbb", subscription);
                        console.log("client", client);
                        if (
                          subscription[0]?.active_plan == true &&
                          _.toLower(subscription[0]?.plan?.planName) !=
                            "free" &&
                          _.toLower(subscription[0]?.plan?.planName) !=
                            "trial" &&
                          client?.whatsappNotification
                        ) {
                          console.log("-------------------");
                          console.log("SENT MSG");
                          console.log("-------------------");

                          resp = await sendWhatsappMSG(client, element);
                          sentMessageCount = sentMessageCount + 1;
                        }
                      }
                    }
                  }
                }
              }
              candidates?.map(async (element) => {
                await Candidates.updateOne(
                  { id: element?.id },
                  { $set: { whatsappMsg: true } }
                );
                // query().update({ whatsapp_msg: true }).where("id", element?.id);
              });
              console.log("-------------------");
              console.log("cronData?.data?.id", cronData?.data?.id);
              console.log("sentMessageCount", sentMessageCount);
              console.log("-------------------");
              let respData = await updateCronTab(
                cronData?.data?.id,
                sentMessageCount
              );
            }
            console.log("-------------------");
            console.log("whatsapp MSG CRON RUN FINISHED");
            console.log("-------------------");
            res.status(200).send({ msg: "Notification Sent" });
          } else {
            res.status(501).send({ msg: "CRON DB INSERT ERROR" });
          }
    } else {
      res.status(501).send({ msg: "TOKEN NOT FOUND. UNAUTHROISED USER" });
    }
  } catch (err) {
    console.info("--------------------");
    console.info("err => ", err);
    console.info("--------------------");
  }
};

const startCronTab = async () => {
  try {
    const objectid = new mongoose.Types.ObjectId();
    let resp = await Cronlogs.create({
      id: objectid,
      _id: objectid,
      cronStart: new Date().toISOString(),
      type: "whatsapp_notification",
    });
    console.log("-------------------");
    console.log("resp", resp);
    console.log("-------------------");
    return { data: resp, isSuccess: true };
  } catch (error) {
    console.log("-------------------");
    console.log("error", error);
    console.log("-------------------");
    return { data: null, isSuccess: false };
  }
};

const updateCronTab = async (id, count = 0) => {
  try {
    let resp = await Cronlogs.updateOne(
      { id: id },
      {
        $set: {
          cronEnd: new Date().toISOString(),
          sentMessages: count,
        },
      }
    );

    return { data: resp, isSuccess: true };
  } catch (error) {
    return { data: null, isSuccess: false };
  }
};
