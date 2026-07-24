const { default: mongoose } = require("mongoose");
const Role = require("../models-v2/role_Mongoose");

exports.createRole = async (req, res) => {
  const data = req.body;
  let objectid = new mongoose.Types.ObjectId();
  await Role.create({ id: objectid, _id: objectid, ...data })
    .then((response) => res.json(response))
    .catch((err) => res.json({ msg: "role create err" }));
};

exports.getRoles = async (req, res) => {
  await Role.aggregate([
    {
      $sort: { createdAt: -1 },
    },
  ])
    .then((response) => res.json(response))
    .catch((err) => res.json({ msg: "role create err" }));
};

exports.getRoleById = async (req, res) => {
  const id = req.params.id;
  await Role.find({ id: id })
    .then((response) => res.json(response))
    .catch((err) => res.json({ msg: "role by id err" }));
};
