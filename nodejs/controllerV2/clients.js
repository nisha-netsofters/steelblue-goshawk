const Clients = require("../models-v2/clients_Mongoose");
const { fileUpload } = require("../middleware/contentful");
const Role = require("../models-v2/role_Mongoose");
const User = require("../models-v2/users_Mongoose");
const {
  sendClientApproval,
  newClientAdded,
  sendInterviewRequestEmail,
  sendInterviewRequestEmailforUniqueworld,
  sendTomatchIndustriesClients,
} = require("../middleware/Emails/email");
const Industries_Relation = require("../models-v2/industriesRelation_Mongoose");
const Candidate = require("../models-v2/candidates_Mongoose");
const InterviewRequest = require("../models-v2/interviewRequest_Mongoose");
const Plans = require("../models-v2/plans_Mongoose");
const Agency = require("../models-v2/agency_Mongooes");
const Subscription = require("../models-v2/subscriptions_Mongoose");
const { default: mongoose } = require("mongoose");
const JobCategory_Relation = require("../models-v2/jobCategoryRelation_Mongoose");
const Industries = require("../models-v2/industries_Mongoose");
const JobCategory = require("../models-v2/jobCategory_Mongoose");
const Users = require("../models-v2/users_Mongoose");
const bcrypt = require("bcryptjs");
const { enqueueEmailJob } = require("../mq/emailProducer");
const {
  sendClientJoinWhatsapp,
} = require("../middleware/whatsappMSG/clientJoinWhatsapp");

exports.getClients = async (req, res) => {
  try {
    let { page, perPage } = req.query;
    page -= 1;
    const clientsFilter = req.body;
    const { industriesId } = req.body;
    const agencyId = req.headers["agencyid"];
    let query = {};
    if (industriesId) {
      query = {
        ...query,
        "industries_relation.industriesId": { $in: industriesId },
      };
      // query["industries_relation.industriesId"] = { $in: industriesId };
      delete clientsFilter.industriesId;
    }
    for (const key in clientsFilter) {
      // builder.andWhere(key, "ilike", `%${clientsFilter[key]}%`);

      query = {
        ...query,
        [key]: { $regex: new RegExp(clientsFilter[key], "i") },
      };
    }

    const clients_Filter_Data = await Clients.aggregate([
      {
        $sort: { createdAt: -1 },
      },
      {
        $match: { agencyId: agencyId },
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
          data: [
            { $match: query },
            { $skip: page * perPage },
            { $limit: Number(perPage) },
          ],
          count: [{ $match: query }, { $count: "total" }],
        },
      },
    ]);
    res.json({
      results: clients_Filter_Data[0]?.data,
      total: clients_Filter_Data[0]?.count[0]?.total || 0,
    });
  } catch (err) {
    console.log("dataa clients filter errr", err);
    res.json({ msg: err });
  }
};

exports.createClients = async (req, res) => {
  try {
    const agencyId = req.headers["agencyid"] || req?.body?.agencyId;
    const agencyEmail = await Agency.findOne({ id: agencyId });
    const emailFromClient = req.body.email;
    const mobileFromClient = req.body.mobile;
    const existingClientsEmailclient = await Users.aggregate([
      {
        $match: { agencyId: agencyId },
      },
      {
        $match: { email: emailFromClient },
      },
    ]);
    const existingClientsMobileclient = await Users.aggregate([
      {
        $match: { agencyId: agencyId },
      },
      {
        $match: { mobile: mobileFromClient },
      },
    ]);
    const existingClientsEmail = await Clients.aggregate([
      {
        $match: { agencyId: agencyId },
      },
      {
        $match: { email: emailFromClient },
      },
    ]);
    const existingClientsMobile = await Clients.aggregate([
      {
        $match: { agencyId: agencyId },
      },
      {
        $match: { mobile: mobileFromClient },
      },
    ]);
  
    if (
      existingClientsEmail.length > 0 ||
      existingClientsEmailclient.length > 0
    ) {
      return res.json({
        error: "Your email is already in use",
      });
    }
    if (
      existingClientsMobile.length > 0 ||
      existingClientsMobileclient.length > 0
    ) {
      return res.json({
        error: "Your Mobile number is already in use",
      });
    }
    let objectid = new mongoose.Types.ObjectId();
    let { industries_relation, jobCategory_relation, ...clients } = req.body;
    if (typeof industries_relation === "string") {
      try {
        industries_relation = JSON.parse(industries_relation);
      } catch (_) {
        industries_relation = [];
      }
    }
    if (typeof jobCategory_relation === "string") {
      try {
        jobCategory_relation = JSON.parse(jobCategory_relation);
      } catch (_) {
        jobCategory_relation = [];
      }
    }
    industries_relation = Array.isArray(industries_relation)
      ? industries_relation
      : [];
    jobCategory_relation = Array.isArray(jobCategory_relation)
      ? jobCategory_relation
      : [];
    let jobCategoriesarr = [];
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
    let industriesIds= []
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

        industriesIds.push(industries_relation[a])
        industriesarr.push(data);
      }
    }

    let industries = ""
    industriesarr?.map((item)=> {
      if(item?.industries?.industryCategory)
        industries = `${industries}, ${item?.industries?.industryCategory}`
    } )

    const industriesMatchedClients = await Clients.find({
      "industries_relation.industriesId":{$in:industriesIds}
    });
  
    const clients_Data = await Clients.create({
      id: objectid,
      _id: objectid,
      agencyId: agencyId,
      industries_relation: industriesarr,
      jobCategory_relation: jobCategoriesarr,
      ...clients,
    });
    await enqueueEmailJob("industryMatchClients", {
      clientsEmail: industriesMatchedClients,
      industries,
    });
    const data = await Clients.findOne({ id: clients_Data?.id });
    await enqueueEmailJob("newClientAdded", {
      client: data,
      emailTo: agencyEmail?.email,
    });

    // Client add → WhatsApp template welcome_msg2 (body_1 fixed text)
    try {
      sendClientJoinWhatsapp(data).catch((err) => {
        console.info("sendClientJoinWhatsapp error =>", err?.message || err);
      });
    } catch (msgErr) {
      console.info(
        "sendClientJoinWhatsapp trigger error =>",
        msgErr?.message || msgErr
      );
    }

    res.json(data);
  } catch (err) {
    console.log("dataa clients create errr", err);
    return res.status(500).json({
      error: err?.message || "Failed to create client",
      columns: err?.columns,
      constraint: err?.constraint,
    });
  }
};

exports.updateClients = async (req, res) => {
  const agencyIdheader = req.headers["agencyid"];
  let {
    industries_relation,
    jobCategory_relation,
    agencyId,
    users,
    ...clients
  } = req.body;
  try {
    const id = req?.params?.id || req?.body?.id;
    console.info("-------------------------------");
    console.info("id => ", id);
    console.info("-------------------------------");
    if (jobCategory_relation?.length == 0 || industries_relation?.length == 0) {
      res.json({ msg: "Something went wrong" });
    }
    const existingClientsEmail = await Clients.findOne({
      email: clients.email,
      id: { $ne: id },
      agencyId: agencyIdheader,
    });
    if (existingClientsEmail) {
      return res.json({
        error: "Your email is already in used",
      });
    }
    const existingClientsMobile = await Clients.findOne({
      mobile: clients.mobile,
      id: { $ne: id },
      agencyId: agencyIdheader,
    });
    if (existingClientsMobile) {
      return res.json({
        error: "Your Mobile number is already in used",
      });
    }
    if (industries_relation[0].industries == undefined) {
      let arrayforCreate = [];
      for (let a = 0; a < industries_relation.length; a++) {
        let objectid = new mongoose.Types.ObjectId();
        arrayforCreate.push({
          industriesId: industries_relation[a],
          cId: id,
          _id: objectid,
          id: objectid,
          industries: await Industries.findOne({
            id: industries_relation[a],
          }),
        });
      }
      await Clients.updateOne(
        { id: id },
        { $unset: { industries_relation: "" } }
      );
      await Clients.updateOne(
        { id: id },
        { $set: { industries_relation: arrayforCreate } }
      );
    }
    if (jobCategory_relation[0].jobCategory == undefined) {
      await Industries_Relation.deleteMany({ cId: id });
      let arrayforCreate = [];
      for (let a = 0; a < jobCategory_relation.length; a++) {
        let objectid = new mongoose.Types.ObjectId();
        arrayforCreate.push({
          jobCategoryId: jobCategory_relation[a],
          cId: id,
          _id: objectid,
          id: objectid,
          jobCategory: await JobCategory.findOne({
            id: jobCategory_relation[a],
          }),
        });
      }
      await Clients.updateOne(
        { id: id },
        { $unset: { jobCategory_relation: "" } }
      );
      await Clients.updateOne(
        { id: id },
        { $set: { jobCategory_relation: arrayforCreate } }
      );
    }
    await Users.updateOne(
      { id: users?.id },
      {
        $set: {
          name: clients?.companyowner,
          mobile: clients?.mobile,
          email: clients?.email,
          address: clients?.address,
          cityId: clients?.cityId,
          stateId: clients?.stateId,
          city: clients?.city,
          state: clients?.state,
        },
      }
    ).then((res) => console.log("res", res));
    await Clients.updateOne({ id: id }, { ...clients });
    res.json({ msg: "success" });
  } catch (err) {
    console.log("dataa Clients Update errr", err);
    res.json({ msg: err });
  }
};

exports.deleteClients = async (req, res) => {
  try {
    const id = req.params.id;
    console.info("--------------------");
    console.info("id => ", id);
    console.info("--------------------");

    const data = await Clients.find({ id: id }).then(async (res) => {
      console.info("res.userId => ", res[0].userId);
      await Clients.deleteOne({ id: id });
      if (res[0].userId) {
        // await Industries_Relation.deleteMany({ cId: id });
        // await JobCategory_Relation.deleteMany({ cId: id });
        await User.deleteOne({ id: res[0].userId });
        // deleteById(data.userId);
      }
    });
    res.json({ msg: "success" });
  } catch (err) {
    console.log("dataa clients delete errr", err);
    res.json({ msg: err });
  }
};

exports.createClientsCrenditialApproved = async (req, res) => {
  try {
    const { body } = req;
    const role = await Role.findOne({ name: "Client" });
    if (!role || !body) {
      return res.status(400).json({ error: "Invalid role or request body" });
    }

    const agencyId = req.headers["agencyid"];
    const agencyDiv = await Agency.findOne({
      id: agencyId,
    });
    if (!agencyId) {
      return res.status(400).json({ error: "Agency ID not found in headers" });
    }

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
    const rawPassword = (body?.mobile || "").toString();
    const hashedPassword = await bcrypt.hash(rawPassword, 10);

    const user_data = {
      id: objectIdUserData,
      _id: objectIdUserData,
      roleId: role?.id,
      name: body?.companyowner,
      email: body?.email,
      password: hashedPassword,
      mobile: body?.mobile,
      subscriptionId: subscription?.id,
      agencyId: agencyId,
      state: body?.state,
      stateId: body?.stateId,
      city: body?.city,
      cityId: body?.cityId,
      isBcrypt: true,
    };

    const user = await Users.create(user_data);

    // For email, send the plain password (mobile) without storing it in the DB
    const userForMail = user.toObject
      ? { ...user.toObject(), password: rawPassword }
      : { ...user, password: rawPassword };

    await enqueueEmailJob("clientApproval", {
      client: userForMail,
      agency: agencyDiv,
    });
    await Subscription.updateOne(
      { id: objectid },
      { userId: objectIdUserData }
    );
    await Clients.updateOne(
      { id: body.id },
      { $set: { userId: objectIdUserData, action: "approved" } }
    );

    res.json({ message: "Client credentials approved successfully", user });
  } catch (error) {
    console.error("Error creating client credentials:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

exports.clientsDeclined = async (req, res) => {
  try {
    const { body } = req;
    await Clients.findOneAndUpdate(
      { id: body.id },
      { $set: { userId: null, action: "declined" } }
    );
    await User.deleteOne({ id: body?.userId });
    res.json({
      msg: "success",
    });
  } catch (err) {
    console.info("----------------------------");
    console.info("declined err =>", err);
    console.info("----------------------------");
  }
};

exports.getAllClients = async (req, res) => {
  const agencyId = req.headers["agencyid"];
  let filterforagency = [];
  if (agencyId) {
    filterforagency.push({
      $match: { agencyId: agencyId },
    });
  }
  await Clients.aggregate([
    ...filterforagency,
    {
      $sort: { createdAt: -1 },
    },
    {
      $match: { action: "approved" },
    },
  ])
    .then((resp) => res.json(resp))
    .catch((err) => {
      console.info("----------------------------");
      console.info("get all clients =>", err);
      console.info("----------------------------");
    });
};
exports.getclientJobCategories = async (req, res) => {
  const id = req.query.id;
  try {
    const jobCategory = await Clients.aggregate([
      {
        $match: { id: id },
      },
    ]);
    res.json(jobCategory);
  } catch (err) {
    console.info("----------------------------");
    console.info("get clients jobCAtegory err =>", err);
    console.info("----------------------------");
  }
};

exports.sendInterViewRequest = async (req, res) => {
  const { clientId, candidateId } = req.query;
  const agencyId = req.headers["agencyid"];
  const agency = await Agency.findOne({ id: agencyId });
  if (!clientId || !candidateId) {
    res.status(400).json({ msg: "Invalid Request" });
  } else
    try {
      const candidateDetails = await Candidate.findOne({ id: candidateId }).lean();
      let clientDetails = await Clients.aggregate([
        {
          $match: { id: clientId },
        },
        {
          $lookup: {
            from: "users",
            localField: "id",
            foreignField: "candidateId",
            as: "users",
          },
        },
        {
          $addFields: {
            users: { $arrayElemAt: ["$users", 0] },
          },
        },
      ]);
      if (clientDetails.length > 0) {
        clientDetails = clientDetails[0];
      }
      if (agency?.email == "uniqueworldjobs@gmail.com") {
        const recipients = [agency?.email, clientDetails?.email].filter(Boolean).join(",");
        await enqueueEmailJob("interviewRequestUniqueworld", {
          client: clientDetails,
          candidate: candidateDetails,
          emailTo: recipients,
        });
      } else {
        const recipients = [agency?.email, clientDetails?.email].filter(Boolean).join(",");
        await enqueueEmailJob("interviewRequest", {
          client: clientDetails,
          candidate: candidateDetails,
          emailTo: recipients,
        });
      }
      const objectid = new mongoose.Types.ObjectId();
      const interviewRequest = await InterviewRequest.create({
        clientId: clientId,
        candidateId: candidateDetails?.id,
        userId: candidateDetails?.userId,
        id: objectid,
        _id: objectid,
      });
      await Candidate.updateOne(
        { id: candidateId },
        {
          $set: {
            interviews: interviewRequest,
          },
        }
      );

      // if (isSent && interviewRequest) { due to mail issue this has to be commented
      if (interviewRequest) {
        res.status(200).json({ msg: "success",interviewRequest: interviewRequest });
      } else {
        res.status(500).json({ msg: "something went wrong" });
      }
    } catch (err) {
      res.json({ msg: "something went wrong" });
    }
};

exports.whatsappNotificationStatus = async (req, res) => {
  const id = req.body?.id;
  const data = req.body?.data;
  try {
    const client = await Clients.findOneAndUpdate(
      { id: id },
      { whatsappNotification: data },
      { new: true }
    );
    res.status(200).json([client]);
  } catch (err) {
    res.status(500).json({ msg: "something went wrong" });
    console.info("--------------------");
    console.info("err => ", err);
    console.info("--------------------");
  }
};
exports.mailNotificationStatus = async (req, res) => {
  const id = req.body?.id;
  const data = req.body?.data;
  try {
    const client = await Clients.findOneAndUpdate(
      { id: id },
      { mailNotification: data }
    );
    res.status(200).json([client]);
  } catch (err) {
    res.status(500).json({ msg: "something went wrong" });
    console.info("--------------------");
    console.info("err => ", err);
    console.info("--------------------");
  }
};
