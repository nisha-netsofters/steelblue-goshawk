const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const Agency = require("../models-v2/agency_Mongooes");
const Users = require("../models-v2/users_Mongoose");
const Role = require("../models-v2/role_Mongoose");
const { default: mongoose } = require("mongoose");
const Candidates = require("../models-v2/candidates_Mongoose");
const {
  AddAgencyMail,
  deactivationMailToDhaval,
  deactivationMailToAgency,
} = require("../middleware/Emails/email");
const CronLogs = require("../models-v2/cronglogs_Mongooes");
const { enqueueEmailJob } = require("../mq/emailProducer");

const saltRounds = 10;

exports.createAgency = async (req, res) => {
  const existingClientsEmail = await Agency.findOne({
    email: req?.body?.email,
  });
  if (existingClientsEmail) {
    return res.json({
      error: "Your email is already in use",
    });
  }
  const existingClientsMobile = await Agency.findOne({
    mobileNumber: req?.body?.mobileNumber,
  });
  if (existingClientsMobile) {
    return res.json({
      error: "Your Mobile number is already in use",
    });
  }
  const existingSlug = await Agency.findOne({
    slug: { $regex: `${req?.body?.slug}`, $options: "i" },
  });
  if (existingSlug) {
    return res.json({
      error: "This slug is already in use",
    });
  }

  if (!existingClientsMobile && !existingClientsEmail && !existingSlug) {
    let objectId = new mongoose.Types.ObjectId();
    let objectId2 = new mongoose.Types.ObjectId();
    const agencycount = await Agency.find({}).countDocuments();
    let resdata = await Agency.create({
      id: objectId,
      _id: objectId,
      agencyCode: agencycount + 1,
      ...req.body,
    });
    await enqueueEmailJob("agencyCreated", {
      name: resdata?.name,
      email: resdata?.email,
      password: resdata?.password,
    });
    let findAdminRole = await Role.findOne({ name: "Admin" });
    if (findAdminRole) {
      const existingClientsEmail = await Users.findOne({
        email: resdata?.email,
      });
      const rawPassword = (resdata?.password || "").toString();
      const hashedPassword = await bcrypt.hash(rawPassword, 10);

      if (existingClientsEmail) {
        let resUser = {
          password: hashedPassword,
          roleId: findAdminRole?.id,
          agencyId: resdata?.id,
          isBcrypt: true,
        };
        await Users.updateOne({ email: resdata?.email }, { $set: resUser });
      } else {
        await Users.create({
          id: objectId2,
          _id: objectId2,
          name: req?.body?.ownerName || req?.body?.name,
          email: resdata?.email,
          password: hashedPassword,
          mobile: resdata?.mobileNumber,
          state: resdata?.state,
          stateId: resdata?.stateId,
          roleId: findAdminRole?.id,
          cityId: resdata?.cityId,
          city: resdata?.city,
          agencyId: resdata?.id,
          address: resdata?.address,
          isBcrypt: true,
        });
      }
      res.json({
        isSuccess: true,
        data: resdata,
      });
    }
  } else {
    res.status(201).send({
      isSuccess: false,
      message: "email already register",
      data: null,
    });
  }
};

exports.getAgency = async (req, res) => {
  //   let resdata = await Agency.create(req.body);

  try {
    let page = parseInt(req?.query?.page) || 0;
    let perPage = parseInt(req?.query?.perPage) || 20;

    let filterObj = {
      $match: {
        $and: [],
      },
    };

    if (req?.query?.id) {
      filterObj.$match.$and.push({ id: req?.query?.id });
    }
    if (req?.body?.name) {
      filterObj.$match.$and.push({
        name: { $regex: `${req?.body?.name}`, $options: "i" },
      });
    }
    if (req?.body?.email) {
      filterObj.$match.$and.push({
        email: { $regex: `${req?.body?.email}`, $options: "i" },
      });
    }
    if (req?.body?.mobileNumber) {
      filterObj.$match.$and.push({
        mobileNumber: { $regex: `${req?.body?.mobileNumber}`, $options: "i" },
      });
    }
    if (req?.body?.phoneNumber) {
      filterObj.$match.$and.push({
        phoneNumber: { $regex: `${req?.body?.phoneNumber}`, $options: "i" },
      });
    }
    if (req?.body?.address) {
      filterObj.$match.$and.push({
        address: { $regex: `${req?.body?.address}`, $options: "i" },
      });
    }
    if (req?.body?.city) {
      filterObj.$match.$and.push({
        city: { $regex: `${req?.body?.city}`, $options: "i" },
      });
    }
    if (req?.body?.state) {
      filterObj.$match.$and.push({
        state: { $regex: `${req?.body?.state}`, $options: "i" },
      });
    }
    if (req?.body?.whatsappLink) {
      filterObj.$match.$and.push({
        whatsappLink: { $regex: `${req?.body?.whatsappLink}`, $options: "i" },
      });
    }
    if (req?.body?.whatsapp) {
      filterObj.$match.$and.push({
        whatsapp: { $regex: `${req?.body?.whatsapp}`, $options: "i" },
      });
    }
    if (req?.body?.gstNo) {
      filterObj.$match.$and.push({
        gstNo: { $regex: `${req?.body?.gstNo}`, $options: "i" },
      });
    }
    if (req?.body?.pancardNo) {
      filterObj.$match.$and.push({
        pancardNo: { $regex: `${req?.body?.pancardNo}`, $options: "i" },
      });
    }
    if (req?.body?.cinNumber) {
      filterObj.$match.$and.push({
        cinNumber: { $regex: `${req?.body?.cinNumber}`, $options: "i" },
      });
    }
    if (req?.body?.permission) {
      const permission = req.body.permission;
      if (permission.dataMerge) {
        if (permission.dataMerge.uniqueworld === true) {
          filterObj.$match.$and.push({
            "permission.dataMerge.uniqueworld": true,
          });
        } else if (permission.dataMerge.uniqueworld === false) {
          filterObj.$match.$and.push({
            "permission.dataMerge.uniqueworld": false,
          });
        }
        if (permission?.dataMerge?.allAgency === true) {
          filterObj.$match.$and.push({
            "permission.dataMerge.allAgency": true,
          });
        } else if (permission?.dataMerge?.allAgency === false) {
          filterObj.$match.$and.push({
            "permission.dataMerge.allAgency": false,
          });
        }
      }

      if (permission?.areas && permission?.areas?.length > 0) {
        // Assuming areas is an array, adjust the filter accordingly
        filterObj.$match.$and.push({
          "permission.areas": { $in: permission.areas },
        });
      }
    }

    if (filterObj?.$match?.$and?.length === 0) {
      filterObj = {};
    }

    let pipeline = [
      // Conditionally add $match stage if filterObj is not empty
      {
        $sort: { updatedAt: -1 },
      },
      ...(Object.keys(filterObj).length ? [filterObj] : []),
      {
        $limit: perPage,
      },
      {
        $skip: perPage * page,
      },
    ];

    let resdata = await Agency.aggregate(pipeline);
    let totalCount = await Agency.aggregate([
      ...pipeline,

      {
        $count: "total",
      },
    ]);

    res.json({
      isSuccess: true,
      data: resdata,
      total: totalCount?.[0]?.total || 0,
    });
  } catch (error) {
    res.status(502).send({
      isSuccess: false,
      data: null,
      error: error,
    });
  }
};

exports.updateAgency = async (req, res) => {
  try {
    const body = req.body || {};
    if (!body.id) {
      return res.json({
        isSuccess: false,
        message: "Agency id field is required",
        error: "Agency id field is required",
        data: null,
      });
    }

    const findAgency = await Agency.findOne({ id: String(body.id) });
    if (!findAgency) {
      return res.json({
        isSuccess: false,
        message: "Agency not found",
        error: "Agency not found",
        data: null,
      });
    }

    const allowed = [
      "slug",
      "name",
      "ownersName",
      "mobileNumber",
      "phoneNumber",
      "email",
      "address",
      "country",
      "countryId",
      "state",
      "stateId",
      "city",
      "cityId",
      "themecolor",
      "whatsapp",
      "whatsappLink",
      "gstNo",
      "pancardNo",
      "cinNumber",
      "permission",
      "logo",
      "bannerImage",
      "isDownloadAble",
      "isDeleted",
      "months",
      "exprireDate",
      "expirable",
    ];
    const userdata = {};
    allowed.forEach((key) => {
      if (body[key] !== undefined) userdata[key] = body[key];
    });

    await Agency.updateOne({ id: findAgency.id }, { $set: userdata });

    const agencyId = String(findAgency.id);
    const findUser =
      (await Users.findOne({
        agencyId,
        email: findAgency.email,
      })) ||
      (await Users.findOne({ agencyId })) ||
      (await Users.findOne({ email: findAgency.email }));

    if (findUser) {
      const userUpdate = {};
      if (userdata.email) userUpdate.email = userdata.email;
      if (userdata.address) userUpdate.address = userdata.address;
      if (userdata.city) userUpdate.city = userdata.city;
      if (userdata.state) userUpdate.state = userdata.state;
      if (userdata.cityId) userUpdate.cityId = userdata.cityId;
      if (userdata.stateId) userUpdate.stateId = userdata.stateId;
      if (userdata.mobileNumber) userUpdate.mobile = userdata.mobileNumber;
      if (userdata.ownersName || userdata.name) {
        userUpdate.name = userdata.ownersName || userdata.name;
      }
      if (Object.keys(userUpdate).length) {
        await Users.updateOne({ id: findUser.id }, { $set: userUpdate });
      }
    }

    const updatedAgencyData = await Agency.findOne({ id: findAgency.id });
    return res.json({
      isSuccess: true,
      data: {
        agency: updatedAgencyData,
      },
      message: "Agency updated successfully",
    });
  } catch (error) {
    console.error("Error in agency update:", error);
    return res.json({
      isSuccess: false,
      message: "Something went wrong in agency update",
      error: "Something went wrong in agency update",
      data: null,
    });
  }
};

exports.deleteAgency = async (req, res) => {
  try {
    if (req?.body?.id) {
      let findAgency = await Agency.findOne({
        id: req?.body?.id,
      });
      if (findAgency) {
        let resdata = await Agency.updateOne(
          { id: req?.body?.id },
          { isDeleted: true }
        );

        res.status(200).send({
          isSuccess: true,
          data: resdata,
          message: "Agency deleted successfully",
        });
      } else {
        res
          .status(502)
          .send({ isSuccess: false, message: "Agency not found", data: null });
      }
    } else {
      res.status(502).send({
        isSuccess: false,
        message: "Agency id field is required",
        data: null,
      });
    }
  } catch (error) {
    res.status(502).send({
      isSuccess: false,
      message: "Someting went wrong in agency deleted",
      data: null,
    });
  }
};

exports.getAgencyViaSlug = async (req, res) => {
  try {
    const slug = req.params.slug;
    const agency = await Agency.aggregate([
      {
        $match: { slug: slug },
      },
      {
        $project: {
          name: 1,
          email: 1,
          mobileNumber: 1,
          _id: 0,
          id: 1,
          state: 1,
          city: 1,
          country: 1,
          countryId: 1,
          logo: 1,
          bannerImage: 1,
          themecolor: 1,
          whatsapp: 1,
          whatsappLink: { $ifNull: ["$whatsappLink", ""] },
          permission: 1,
          isDeleted: 1,
          createdAt: 1,
          slug: 1,
          ownersName: 1,
          isDownloadAble: 1,
          // cinNumber: 1,
          // pancardNo: 1,
          // gstNo: 1,
        },
      },
    ]);
    if (agency.length === 0) {
      return res.status(201).json({
        error: "Your slug is not present in agency",
      });
    } else {
      res.status(200).send(agency[0]);
    }
  } catch (error) {
    res.status(502).json({ error: "Internal error" });
  }
};
exports.getCandidateForAgency = async (req, res) => {
  try {
    const basicDetails = req.body;
    let dataMerge = {};
    for (const key in basicDetails) {
      dataMerge = {
        ...dataMerge,
        [`agency.permission.dataMerge.${key}`]: basicDetails[key],
      };
    }
    const pipeline = [
      {
        $match: {
          ...dataMerge,
        },
      },
    ];

    const agency = await Candidates.aggregate([
      {
        $sort: { createdAt: -1 },
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
      ...pipeline,
      {
        $project: { firstname: 1, createdAt: 1 },
      },
      // {
      //   $match: { "agency.permission.dataMerge.allAgency": false },
      // },
      {
        $limit: 10,
      },
    ]);
    // if (!agency) {
    //   return res.status(201).json({
    //     error: "Your slug is not present in agency",
    //   });
    // } else {
    res.status(200).send(agency);
    // }
  } catch (error) {
    res.status(502).json({ error: "Internal error" });
  }
};

exports.updateAgencyActive = async (req, res) => {
  try {
    const id = req.params.id;
    const value = req.body.isDeleted;
    await Agency.updateOne(
      {
        id,
      },
      {
        $set: { isDeleted: value },
      }
    );
    res.json({ msg: "success" });
  } catch (error) {
    res.status(502).json({ error: "Internal error" });
  }
};

exports.getAgencyViaSlugPublic = async (req, res) => {
  try {
    const slug = req.params.slug;
    const agency = await Agency.aggregate([
      {
        $match: { slug: slug },
      },
      {
        $project: {
          id: 1,
          _id: 0,
          name: 1,
          logo: 1,
          bannerImage: 1,
          email: 1,
          ownersName: 1,
          whatsappLink: { $ifNull: ["$whatsappLink", ""] }
        },
      },
    ]);
    if (agency.length == 0) {
      return res.status(201).json({
        error: "Your slug is not present in agency",
      });
    } else {
      res.status(200).send(agency[0]);
    }
  } catch (error) {
    res.status(502).json({ error: "Internal error" });
  }
};

exports.AgencyValidityUpdate = async (req, res) => {
  try {
    const id = req?.body?.id;
    const date = req?.body?.date;
    const months = req?.body?.months;
    await Agency.updateOne(
      { id: id },
      {
        $set: {
          months: months,
          exprireDate: date,
          isDeleted: false,
          sentmail: false,
          firstmail: false,
        },
      }
    )
      .then((res) => {
        console.log("res", res);
      })
      .catch((error) => {
        console.log(error);
      });
    res.json({ msg: "success" });
  } catch (error) {
    res.status(502).json({ error: "Error while  updating validity" });
  }
};

exports.removeExpiredNames = async (req, res) => {
  try {
    if (req?.query?.token === process.env.WHATSAPP_NOTIFICATION_CRON_PASSWORD) {
      let diactivatedAgency = 0;
      let cronData = await startCronTab("agency_diactivate");
      const present = new Date();
      const agencies = await Agency.find({
        exprireDate: { $lte: present },
      });
      await updateCronTab(cronData?.data?.id, diactivatedAgency);
      if (agencies.length == 0) {
        res.json({ msg: "No agency to deactivate" });
      } else {
        for (let agency of agencies) {
          if (agency?.expirable == true) {
            await Agency.updateOne(
              { id: agency.id },
              { $set: { isDeleted: true } }
            );
            diactivatedAgency = diactivatedAgency + 1;
            res.json({ msg: "success" });
          } else {
            res.json({ msg: "Not any agency which is expirable" });
          }
        }
      }
    }
  } catch (error) {
    res.json({ msg: "Something failed" });
  }
};
exports.sendMailforAgencyDeactivation = async (req, res) => {
  try {
    if (req?.query?.token === process.env.WHATSAPP_NOTIFICATION_CRON_PASSWORD) {
      let sentmailtoAgency = 0;
      let cronData = await startCronTab("agency_deactivation_mail");
      const today = new Date();
      const yesterday = new Date(today);
      const daybeforeYesterday = new Date(today);
      yesterday.setDate(today.getDate() + 1);
      daybeforeYesterday.setDate(today.getDate() + 2);
      const yesterdayDate = new Date(yesterday);
      const daybeforeyesterdayDate = new Date(daybeforeYesterday);
      const yesterdayDateString = yesterdayDate.toISOString().split("T")[0];
      const dayBeforeYesterdayDateString = daybeforeyesterdayDate
        .toISOString()
        .split("T")[0];
      const agenciesYesterday = await Agency.aggregate([
        {
          $match: {
            $expr: {
              $eq: [
                { $dateToString: { format: "%Y-%m-%d", date: "$exprireDate" } },
                yesterdayDateString,
              ],
            },
          },
        },
      ]);

      const agenciesDayBeforeYesterday = await Agency.aggregate([
        {
          $match: {
            $expr: {
              $eq: [
                { $dateToString: { format: "%Y-%m-%d", date: "$exprireDate" } },
                dayBeforeYesterdayDateString,
              ],
            },
          },
        },
      ]);

      for (let agency of agenciesDayBeforeYesterday) {
        if (
          agency?.expirable == true &&
          agency?.sentmail == false &&
          agency?.firstmail == false
        ) {
          await Agency.updateOne(
            { id: agency.id },
            { $set: { firstmail: true } }
          );
          await enqueueEmailJob("agencyDeactivationAgency", {
            agencyownername: agency?.ownersName,
            email: agency?.email,
          });
          sentmailtoAgency = sentmailtoAgency + 1;
        }
      }
      for (let agency of agenciesYesterday) {
        if (agency?.expirable == true && agency?.sentmail == false) {
          await Agency.updateOne(
            { id: agency.id },
            { $set: { sentmail: true, months: null } }
          );
          await enqueueEmailJob("agencyDeactivationDhaval", {
            agencyownername: agency?.ownersName,
            expireDate: new Date(agency?.exprireDate).toLocaleDateString(),
          });
          await enqueueEmailJob("agencyDeactivationAgency", {
            agencyownername: agency?.ownersName,
            email: agency?.email,
          });
          sentmailtoAgency = sentmailtoAgency + 1;
        }
      }
      await updateCronTabforMail(cronData?.data?.id, sentmailtoAgency);
      res.json({ msg: "sent mail's to " + sentmailtoAgency + " Agencies" });
    } else {
      res.json({ msg: "Something failed" });
    }
  } catch (error) {
    res.json({ msg: "Something failed" });
  }
};
const startCronTab = async (typeofcron) => {
  try {
    const objectid = new mongoose.Types.ObjectId();
    let resp = await CronLogs.create({
      id: objectid,
      _id: objectid,
      cronStart: new Date().toISOString(),
      type: typeofcron,
      // type: "agency_diactivate",
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
    let resp = await CronLogs.updateOne(
      { id: id },
      {
        $set: {
          cronEnd: new Date().toISOString(),
          metadata: { agencyDeactivated: count },
        },
      }
    );
    return { data: resp, isSuccess: true };
  } catch (error) {
    return { data: null, isSuccess: false };
  }
};
const updateCronTabforMail = async (id, count = 0) => {
  try {
    let resp = await CronLogs.updateOne(
      { id: id },
      {
        $set: {
          cronEnd: new Date().toISOString(),
          metadata: { mailsent: count },
        },
      }
    );
    return { data: resp, isSuccess: true };
  } catch (error) {
    return { data: null, isSuccess: false };
  }
};
