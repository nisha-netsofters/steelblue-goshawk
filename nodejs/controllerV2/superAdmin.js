const jwt = require("jsonwebtoken");
const Users = require("../models-v2/superAdmin_Mongooes");
const Usersofuser = require("../models-v2/users_Mongoose");

const bcrypt = require("bcryptjs");
const { default: mongoose } = require("mongoose");
const Agency = require("../models-v2/agency_Mongooes");
const Candidates = require("../models-v2/candidates_Mongoose");
const Clients = require("../models-v2/clients_Mongoose");
const Orderofpayments = require("../models-v2/orderOfPayments_Mongoose");

const saltRounds = 10;

exports.loginUser = async (req, res) => {
  const { email, password } = req.body;
  const userDetail = await Users.findOne({ email });
  if (!userDetail) {
    return res.json({
      msg: "user is not valid",
    });
  }

  const isPasswordValid = await bcrypt.compare(
    password || "",
    userDetail.password || ""
  );
  if (!isPasswordValid) {
    return res.json({
      msg: "password is not valid",
    });
  }

  try {
    const result = await Users.aggregate([
      { $match: { email } },
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
      { $project: { password: 0 } },
    ]);

    if (!result?.length) {
      return res.json({
        msg: "user is not valid",
      });
    }

    const userData = result[0];
    userData.role = {
      name: "SuperAdmin",
    };

    jwt.sign(
      { userDetail },
      process.env.SECRET,
      { expiresIn: process.env.EXPIRES_IN },
      (err, token) => {
        if (err) {
          return res.json({
            msg: "user is not valid",
          });
        }
        return res.json({
          token,
          user: userData,
        });
      }
    );
  } catch (err) {
    console.log("login", err);
    return res.json({
      msg: "user is not valid",
    });
  }
};

exports.VerifyToken = async (req, res) => {
  const { token } = req.query;
  let expired = false;
  jwt.verify(token, process.env.SECRET, (err, authdata) => {
    if (err) {
      console.log("invalid token or expired token");
      expired = true;
    }
  });

  res.json({ expired });
};

exports.refreshToken = async (req, res) => {
  const { email, password } = req.body;
  const userDetail = await Users.findOne({ email });
  bcrypt.compare(password, userDetail?.password, async function (err, result) {
    if (result) {
      await Users.aggregate([
        { $match: { email } },
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
        { $project: { password: 0 } },
      ])
        .then(async (result) => {
          let userData = result[0];
          userData["role"] = "superAdmin";
          if (result?.length > 0) {
            jwt.sign(
              { userDetail },
              process.env.SECRET,
              { expiresIn: process.env.EXPIRES_IN },
              (err, token) => {
                res.json({
                  token,
                  user: userData,
                });
              }
            );
          } else {
            res.json({
              msg: "user is not valid",
            });
          }
        })
        .catch((err) => console.log("login", err));
    }
  });
};

exports.createUser = async (req, res) => {
  const { email, password } = req.body;
  await Users.findOne({
    email,
    password,
  })
    .then(async (result) => {
      if (result) {
        res.json({
          msg: "user already exits",
        });
      } else {
        const objectid = new mongoose.Types.ObjectId();
        bcrypt.hash(password, saltRounds, async function (err, hash) {
          let user = await Users.create({
            id: objectid,
            _id: objectid,
            email,
            password: hash,
            address: req?.body?.address,
            image: req?.body?.image,
            mobile: null,
            name: req?.body?.name || "Super Admin",
          });
          res.json({
            data: user,
          });
        });
      }
    })
    .catch((err) => console.log("login user", err));
};
exports.agencyDashboard = async (req, res) => {
  try {
    const agecny = await Agency.find({}).countDocuments();
    const candidate = await Candidates.find({}).countDocuments();
    const client = await Clients.find({
      action: "approved",
    }).countDocuments();
    res.json({
      agency: agecny,
      candidate: candidate,
      client: client,
    });
  } catch (error) {
    res.json({
      msg: "Internal error",
    });
  }
};
exports.agencyCount = async (req, res) => {
  try {
    const agecnyActive = await Agency.find({
      isDeleted: false,
    }).countDocuments();
    const agecnyInActive = await Agency.find({
      isDeleted: true,
    }).countDocuments();
    res.json({
      active: agecnyActive,
      inactive: agecnyInActive,
    });
  } catch (error) {
    res.json({
      msg: "Internal error",
    });
  }
};
exports.agencyDashboardList = async (req, res) => {
  let { page, perPage } = req.body;
  page = page - 1;
  try {
    const agency = await Agency.aggregate([
      {
        $lookup: {
          from: "candidates",
          localField: "id",
          foreignField: "agencyId",
          as: "candidates",
        },
      },
      {
        $lookup: {
          from: "clients",
          localField: "id",
          foreignField: "agencyId",
          as: "clients",
          pipeline: [
            {
              $match: { action: "approved" },
            },
          ],
        },
      },
      {
        $project: {
          name: 1,
          email: 1,
          city: 1,
          id: 1,
          candidatesCount: { $size: { $ifNull: ["$candidates", []] } },
          clientsCount: { $size: { $ifNull: ["$clients", []] } },
          isDeleted: 1,
          ownersName: 1,
          _id: 0,
        },
      },
      {
        $addFields: {
          status: {
            $cond: {
              if: { $eq: ["$isDeleted", true] },
              then: "inactive",
              else: "active",
            },
          },
        },
      },
      {
        $facet: {
          data: [
            {
              $skip: page * perPage,
            },
            {
              $limit: Number(perPage),
            },
          ],
          count: [{ $group: { _id: null, count: { $sum: 1 } } }],
        },
      },
    ]);
    const result = {
      data: agency[0].data,
      count: agency[0].count[0] ? agency[0].count[0].count : 0,
    };
    res.json({
      results: result.data,
      total: result.count,
    });
  } catch (error) {
    res.status(200).json({
      msg: "Something went wrong",
    });
  }
};

exports.transactionlist = async (req, res) => {
  try {
    let { page, perPage, filterData } = req.body;

    const userId = req.headers.userid;

    const user = await Usersofuser.findOne({ id: userId });

    let filter = {};
    if (user && user?.email !== "uniqueworldjobs@gmail.com") {
      filter = {
        ...filter,
        agencyId: user?.agencyId,
      };
    }
    if (filterData?.plan) {
      filter = {
        ...filter,
        "plans.id": { $in: filterData.plan },
      };
    }
    if (filterData?.city) {
      filter = {
        ...filter,
        city: filterData.city,
      };
    }
    if (filterData?.AgencyName) {
      filter = {
        ...filter,
        "agency.name": { $regex: filterData.AgencyName, $options: "i" },
      };
    }
    if (filterData?.transactionId) {
      filter = {
        ...filter,
        merchantTransactionId: {
          $regex: filterData.transactionId,
          $options: "i",
        },
      };
    }
    if (filterData?.endDate || filterData?.startDate) {
      filter = {
        ...filter,
        createdAt: {
          ...(filterData?.startDate && {
            $gte: new Date(filterData.startDate),
          }),
          ...(filterData?.endDate && { $lte: new Date(filterData.endDate) }),
        },
      };
    }
    if (filterData?.AgencyName) {
      filter = {
        ...filter,
        "agency.name": { $regex: filterData.AgencyName, $options: "i" },
      };
    }

    if (filterData?.invoiceTo) {
      const firstname = filterData?.invoiceTo.split(" ")[0];
      const lastName = filterData?.invoiceTo.split(" ")[1];
      const invoiceToRegex = {
        $regex: `${filterData.invoiceTo}`,
        $options: "i",
      };
      filter = {
        ...filter,
        $or: [
          { Company: invoiceToRegex },
          { firstname: { $regex: `${firstname}`, $options: "i" } },
          { lastname: { $regex: `${lastName}`, $options: "i" } },
        ],
      };
    }
    if (filterData?.status) {
      if (filterData?.status === "PENDING") {
        filter = {
          ...filter,
          "servertoserverRes.state": { $nin: ["COMPLETED", "FAILED"] },
        };
      } else if (
        filterData?.status === "COMPLETED" ||
        filterData?.status === "FAILED"
      ) {
        filter = {
          ...filter,
          "servertoserverRes.state": filterData.status,
        };
      }
    }
    const order = await Orderofpayments.aggregate([
      {
        $sort: { createdAt: -1 },
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
      {
        $match: { ...filter },
      },
      {
        $facet: {
          data: [
            {
              $skip: page * perPage,
            },
            {
              $limit: Number(perPage),
            },
          ],
          count: [{ $group: { _id: null, count: { $sum: 1 } } }],
        },
      },
    ]);
    if (order?.length > 0) {
      const result = {
        data: order[0].data,
        count: order[0].count[0] ? order[0].count[0].count : 0,
      };
      res.json({
        results: result.data,
        total: result.count,
      });
    } else {
      res.send({
        msg: "Internal error",
      });
    }
  } catch (err) {
    console.log("-------------------");
    console.log("error phonePe", err);
    console.log("-------------------");
  }
};
