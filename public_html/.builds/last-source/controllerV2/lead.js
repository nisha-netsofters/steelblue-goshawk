const Lead = require("../models-v2/lead_Mongoose");

const { fileUpload } = require("../middleware/contentful");
const { awsUploadFiles } = require("../middleware/awsS3");
const { default: mongoose } = require("mongoose");
const Industries = require("../models-v2/industries_Mongoose");
const Users = require("../models-v2/users_Mongoose");
const Clients = require("../models-v2/clients_Mongoose");
const Role = require("../models-v2/role_Mongoose");
const Agency = require("../models-v2/agency_Mongooes");
const Plans = require("../models-v2/plans_Mongoose");
const Subscription = require("../models-v2/subscriptions_Mongoose");
const JobCategory = require("../models-v2/jobCategory_Mongoose");
const {
  sendClientApproval,
  newClientAdded,
} = require("../middleware/Emails/email");
const { enqueueEmailJob } = require("../mq/emailProducer");
exports.createLead = async (req, res) => {
  try {
    let objectid = new mongoose.Types.ObjectId();
    let { industries_relation, jobCategory_relation, ...clients } = req.body;
    let jobCategoriesarr = [];
    if (
      !jobCategory_relation ||
      !industries_relation ||
      industries_relation.length == 0 ||
      jobCategory_relation == 0
    ) {
      res.status(500).json({ msg: "error", error: "Invalid data" });
    }
    if (jobCategory_relation.length > 0) {
      for (let a = 0; a < jobCategory_relation.length; a++) {
        let objectidjobcat = new mongoose.Types.ObjectId();
        let data = {
          id: objectidjobcat,
          _id: objectidjobcat,
          cId: objectid,
          createdAt: new Date(),
          jobCategoryId: jobCategory_relation[a],
          jobCategory: await JobCategory.findOne({
            id: jobCategory_relation[a],
          }),
        };
        jobCategoriesarr.push(data);
      }
    }
    let industriesarr = [];
    if (industries_relation.length > 0) {
      for (let a = 0; a < industries_relation.length; a++) {
        let objectidjobcat = new mongoose.Types.ObjectId();
        let data = {
          id: objectidjobcat,
          _id: objectidjobcat,
          cId: objectid,
          createdAt: new Date(),
          industriesId: industries_relation[a],
          industries: await Industries.findOne({
            id: industries_relation[a],
          }),
        };
        industriesarr.push(data);
      }
    }
    const clients_Data = await Lead.create({
      id: objectid,
      _id: objectid,
      industries_relation: industriesarr,
      jobCategory_relation: jobCategoriesarr,
      ...clients,
    });
    const data = await Lead.findOne({ id: clients_Data?.id });
    const cityValue = (clients?.city || "").trim();
    if (cityValue) {
      const escapedCity = cityValue.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const agencyslist = await Agency.aggregate([
        {
          $match: { city: new RegExp(escapedCity, "i") },
        },
      ]);

      let i = 0;
      while (i < agencyslist?.length) {
        const item = agencyslist[i];
        await enqueueEmailJob("newClientAdded", {
          client: data,
          emailTo: item?.email,
        });
        i++;
      }
    }
    res.json({ msg: "success", data });
  } catch (err) {
    console.log("dataa clients create errr", err);
    res.json({ columns: err?.columns, constraint: err?.constraint });
  }
};

exports.getLead = async (req, res) => {
  try {
    const agencyId = req.headers["agencyid"];
    const agency = await Agency.findOne({ id: agencyId });
    if (!agencyId || !agency) {
      return res.status(400).json({ error: "Invalid agencyid" });
    }
    let { page, perPage } = req.query;
    page -= 1;

    // const clientsFilter = req.body;
    // const industriesId = req.body.industriesId;
    // let query = {};
    // if (industriesId) {
    //   query = {
    //     ...query,
    //     "industries_relation.industriesId": { $in: industriesId },
    //   };
    //   // query["industries_relation.industriesId"] = { $in: industriesId };
    //   delete clientsFilter.industriesId;
    // }
    // for (const key in clientsFilter) {
    //   // builder.andWhere(key, "ilike", `%${clientsFilter[key]}%`);
    //   query = {
    //     ...query,
    //     [key]: { $regex: new RegExp(clientsFilter[key], "i") },
    //   };
    // }
    let filter = {};
    if (agency.email !== "uniqueworldjobs@gmail.com") {
      const agencyCity = (agency.city || "").trim();
      filter = {
        ...filter,
        approved: { $ne: agencyId },
        deleteAgency: { $ne: agencyId },
        ...(agencyCity ? { city: new RegExp(`^${agencyCity.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") } : {}),
      };
    }
    const clients_Filter_Data = await Lead.aggregate([
      {
        $sort: { createdAt: -1 },
      },
      {
        $match: { ...filter },
      },
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "id",
          as: "users",
          pipeline: [
            {
              $lookup: {
                from: "role",
                localField: "roleId",
                foreignField: "id",
                as: "role",
              },
            },
            {
              $addFields: {
                role: { $arrayElemAt: ["$role", 0] },
              },
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
        $facet: {
          data: [{ $skip: page * perPage }, { $limit: Number(perPage) }],
          count: [{ $count: "total" }],
        },
      },
    ]);
    res.json({
      results: clients_Filter_Data[0]?.data,
      total: clients_Filter_Data[0]?.count[0]?.total || 0,
    });
  } catch (err) {
    console.log("dataa clients filter errr", err);
    res.status(500).json({ msg: "error", err });
  }
};

exports.deleteLead = async (req, res) => {
  try {
    const agencyId = req.headers["agencyid"] || req.body.agencyId;
    const id = req.params.id;
    const lead = await Lead.findOne({ id: id });
    if (!lead || !agencyId) {
      return res
        .status(400)
        .json({ error: "Invalid lead id or Invalid agencyid" });
    }
    await Lead.updateOne({ id: id }, { $addToSet: { deleteAgency: agencyId } })
      .then(() => {
        res.json({ msg: "success" });
      })
      .catch((err) => {
        console.info("-------------------------------");
        console.info("err => ", err);
        console.info("-------------------------------");
        res.json({ msg: err });
      });
  } catch (err) {
    console.log("dataa Lead delete errr", err);
    res.json({ msg: err });
  }
};
exports.createClientsCrenditialApproved = async (req, res) => {
  try {
    const id = req.params.id;
    const role = await Role.findOne({ name: "Client" });
    const lead = await Lead.findOne({ id: id });
    if (!role || !lead || !id) {
      return res.status(400).json({ error: "Invalid role or  lead Id" });
    }
    const agencyId = req.headers["agencyid"];
    const agencyDiv = await Agency.findOne({
      id: agencyId,
    });
    if (!agencyDiv || !agencyId) {
      return res.status(400).json({ error: "Agency ID not found in headers" });
    }
    const existingClientsEmail = await Clients.findOne({
      email: lead?.email,
      agencyId: agencyId,
    });
    const existingClientsMobile = await Clients.findOne({
      mobile: lead?.mobile,
      agencyId: agencyId,
    });
    const existingEmail = await Users.findOne({
      email: lead?.email,
      agencyId: agencyId,
    });
    const existingMobile = await Users.findOne({
      mobile: lead?.mobile,
      agencyId: agencyId,
    });
    if (existingClientsMobile || existingMobile) {
      return res.json({
        error: "Your Mobile number is already in used",
      });
    }
    if (existingClientsEmail || existingEmail) {
      return res.json({
        error: "Your email is already in used",
      });
    }

    await Lead.updateOne({ id: id }, { $addToSet: { approved: agencyId } });
    const getFreeplanData = await Plans.aggregate([
      { $match: { planName: "Trial" } },
      {
        $lookup: {
          from: "plan_features",
          localField: "plan_feature_id",
          foreignField: "id",
          as: "plan_features",
        },
      },
    ]);

    const objectid = new mongoose.Types.ObjectId();
    const subscription = await Subscription.create({
      id: objectid,
      _id: objectid,
      planId: getFreeplanData[0]?.id,
      userId: null,
    });

    const objectIdUserData = new mongoose.Types.ObjectId();
    const rawPassword = (lead?.mobile || "").toString();
    const hashedPassword = await bcrypt.hash(rawPassword, 10);

    const user_data = {
      id: objectIdUserData,
      _id: objectIdUserData,
      roleId: role?.id,
      name: lead?.companyowner,
      address: lead?.street,
      email: lead?.email,
      password: hashedPassword,
      mobile: lead?.mobile,
      subscriptionId: subscription?.id,
      agencyId: agencyId,
      state: lead?.state,
      stateId: lead?.stateId,
      city: lead?.city,
      cityId: lead?.cityId,
      isBcrypt: true,
    };
    const objectid2 = new mongoose.Types.ObjectId();
    const client_data = {
      id: objectid2,
      _id: objectid2,
      roleId: role?.id,
      companyowner: lead?.companyowner,
      companyName: lead?.companyName,
      email: lead?.email,
      industries_relation: lead?.industries_relation,
      jobCategory_relation: lead?.jobCategory_relation,
      whatsappNotification: true,
      mailNotification: true,
      action: "approved",
      zip: lead?.zip,
      businessNature: lead?.businessNature,
      street: lead?.street,
      mobile: lead?.mobile,
      subscriptionId: subscription?.id,
      agencyId: agencyId,
      state: lead?.state,
      stateId: lead?.stateId,
      city: lead?.city,
      cityId: lead?.cityId,
    };
    const user = await Users.create({
      ...user_data,
    });

    // For email, send the plain password (mobile) without storing it in the DB
    const userForMail = user.toObject
      ? { ...user.toObject(), password: rawPassword }
      : { ...user, password: rawPassword };
    const client = await Clients.create({
      userId: objectIdUserData,
      ...client_data,
    });
    await enqueueEmailJob("clientApproval", {
      client: userForMail,
      agency: agencyDiv,
    });
    await Subscription.updateOne(
      { id: objectid },
      { userId: objectIdUserData }
    );

    res.json({
      message: "Client credentials approved successfully",
      client: client,
      user: user,
    });
  } catch (error) {
    console.error("Error creating client credentials:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
