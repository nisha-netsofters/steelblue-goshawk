const Clients = require("../models/Clients");
const { fileUpload } = require("../middleware/contentful");
const Role = require("../models/Role");
const User = require("../models/User");
const {
  sendClientApproval,
  newClientAdded,
  sendInterviewRequestEmail,
} = require("../middleware/Emails/email");
const Industries_Relation = require("../models/Industries_Relation");
const Candidate = require("../models/Candidate");
const InterviewRequest = require("../models/Interview_Request");
const Plans = require("../models/Plan");
const Subscriptions = require("../models/Subscriptions");
const { enqueueEmailJob } = require("../mq/emailProducer");

exports.getClients = async (req, res) => {
  try {
    let { page, perPage } = req.query;
    page -= 1;
    const clientsFilter = req.body;
    const { industriesId } = req.body;
    if (industriesId) {
      delete clientsFilter.industriesId;
    }
    const clients_Filter_Data = await Clients.query()
      .where((builder) => {
        for (const key in clientsFilter) {
          builder.andWhere(key, "ilike", `%${clientsFilter[key]}%`);
        }
      })
      .andWhere((builder) => {
        if (industriesId) {
          builder.whereExists(
            Clients.relatedQuery("industries_relation").whereIn(
              "industriesId",
              industriesId
            )
          );
        }
      })
      .page(page, perPage)
      .withGraphFetched("industries_relation.industries")
      .withGraphFetched("jobCategory_relation.jobCategory")
      .withGraphFetched("users")
      .orderBy("created_at", "desc");

    res.json(clients_Filter_Data);
  } catch (err) {
    console.log("dataa clients filter errr", err);
    res.json({ msg: err });
  }
};

exports.createClients = async (req, res) => {
  let clients = req.body;
  if (clients?.industries_relation) {
    clients.industries_relation = JSON.parse(req.body.industries_relation);
  }
  if (clients?.industries_relation) {
    clients.jobCategory_relation = JSON.parse(req.body.jobCategory_relation);
  }

  try {
    const clients_Data = await Clients.query().insertGraph(clients);
    await enqueueEmailJob("newClientAdded", {
      client: clients_Data,
      emailTo: process.env.INTERVIEW_REQUEST || process.env.REACT_APP_USER,
    });
    res.json(clients_Data);
  } catch (err) {
    console.log("dataa clients create errr", err);
    res.json({ columns: err?.columns, constraint: err?.constraint });
  }
};

exports.updateClients = async (req, res) => {
  let clients = req.body;

  if (clients?.industries_relation) {
    clients.industries_relation = JSON.parse(req.body.industries_relation);
    clients.industries_relation?.filter((ele) => {
      delete ele.value;
      delete ele.label;
      return ele;
    });
  }
  if (clients?.jobCategory_relation) {
    clients.jobCategory_relation = JSON.parse(req.body.jobCategory_relation);
    clients.jobCategory_relation?.filter((ele) => {
      delete ele.value;
      delete ele.label;
      return ele;
    });
  }

  try {
    await Clients.query().upsertGraph(clients, {
      relate: true,
      insertMissing: true,
    });
    res.json({ msg: "success" });
  } catch (err) {
    console.log("dataa Clients Update errr", err);
    res.json({ msg: err });
  }
};

exports.deleteClients = async (req, res) => {
  try {
    const id = req.params.id;

    const data = await Clients.query().findById(id);
    await Clients.query().deleteById(id);
    await Industries_Relation.query().delete().where("c_Id", id);
    if (data?.userId) {
      await User.query().deleteById(data.userId);
    }
    res.json({ msg: "success" });
  } catch (err) {
    console.log("dataa clients delete errr", err);
    res.json({ msg: err });
  }
};

exports.createClientsCrenditialApproved = async (req, res) => {
  try {
    const { body } = req;
    const role = await Role.query()
      .select("id")
      .where("name", "=", "Client")
      .catch((err) => console.log("err role find", err));

    if (role && body) {
      const getFreeplanData = await Plans.query()
        .withGraphFetched("planFeature")
        .findOne("planName", "Trial");
      const subscription = await Subscriptions.query().insert({
        planId: getFreeplanData.id,
      });
      const user_data = {
        roleId: role[0].id,
        name: body?.companyowner,
        email: body?.email,
        password: body?.mobile,
        mobile: body?.mobile,
        address: body?.city,
        subscriptionId: subscription.id,
      };

      const user = await User.query()
        .insertGraph(user_data, { relate: true })
        .then(async (res) => {
          return res;
        })
        .catch((err) =>
          res.json({ columns: err?.columns, constraint: err?.constraint })
        );
      if (user?.id) {
        await enqueueEmailJob("clientApproval", {
          client: user,
          agency: {}, // legacy v1 – agency details not used in template here
        });
        await Clients.query()
          .returning("*")
          .update({ action: "approved", userId: user.id })
          .where("id", body.id)
          .then((resp) => {
            res.json(resp);
          });
      }
    }
  } catch (err) {
    console.info("----------------------------");
    console.info("client user err =>", err);
    console.info("----------------------------");
  }
};

exports.clientsDeclined = async (req, res) => {
  try {
    const { body } = req;
    await Clients.query()
      .update({ userId: null, action: "declined" })
      .where("id", body.id);
    await User.query().deleteById(body.userId);
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
  await Clients.query()
    .where("action", "=", "approved")
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
    const jobCategory = await Clients.query()
      .where("id", id)
      .withGraphFetched("jobCategories");
    res.json(jobCategory);
  } catch (err) {
    console.info("----------------------------");
    console.info("get clients jobCAtegory err =>", err);
    console.info("----------------------------");
  }
};

exports.sendInterViewRequest = async (req, res) => {
  const { clientId, candidateId } = req.query;
  if (!clientId || !candidateId) {
    res.status(400).json({ msg: "Invalid Request" });
  } else
    try {
      const candidateDetails = await Candidate.query()
        .withGraphFetched("professional.jobCategory")
        .findById(candidateId);
      const clientDetails = await Clients.query()
        .withGraphFetched("users")
        .findById(clientId)
        .withGraphFetched("jobCategory_relation.jobCategory");

      await enqueueEmailJob("interviewRequest", {
        client: clientDetails,
        candidate: candidateDetails,
        emailTo: process.env.INTERVIEW_REQUEST || clientDetails?.email,
      });
      const interviewRequest = await InterviewRequest.query().insert({
        clientId: clientId,
        candidateId: candidateDetails?.id,
        userId: clientDetails?.users?.id,
      });
      if (interviewRequest) {
        res.status(200).json({ msg: "success" });
      } else {
        res.status(500).json({ msg: "something went wrong" });
      }
    } catch (err) {
      res.json({ msg: "something went wrong" });
    }
};

exports.whatsappNotificationStatus = async (req, res) => {
  const id = req.body?.id
  const data = req.body?.data
  try {
 const client = await Clients.query()
  .update({ whatsapp_notification: data })
  .where("id", id)
  .returning('*');
  res.status(200).json(client);
 } catch (err) {
   res.status(500).json({ msg: "something went wrong" });
  console.info('--------------------')
  console.info('err => ', err )
  console.info('--------------------')
 }
};
exports.mailNotificationStatus = async (req, res) => {
  const id = req.body?.id
  const data = req.body?.data
  try {
 const client = await Clients.query()
  .update({ mail_notification: data })
  .where("id", id)
  .returning('*');
  res.status(200).json(client);
 } catch (err) {
   res.status(500).json({ msg: "something went wrong" });
  console.info('--------------------')
  console.info('err => ', err )
  console.info('--------------------')
 }
};
