const Role = require('../models/Role')

exports.createRole = async (req, res) => {
  const data = req.body
  await Role.query()
    .insert(data)
    .then((response) => res.json(response))
    .catch((err) => res.json({ msg: 'role create err' }))
}

exports.getRoles = async (req, res) => {
  await Role.query()
    .then((response) => res.json(response))
    .catch((err) => res.json({ msg: 'role create err' }))
}

exports.getRoleById = async (req, res) => {
  const id = req.params.id
  await Role.query().where('id', id)
    .then((response) => res.json(response))
    .catch((err) => res.json({ msg: 'role by id err' }))
}

