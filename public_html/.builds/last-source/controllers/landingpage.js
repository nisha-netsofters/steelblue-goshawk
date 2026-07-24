const Clients = require("../models/Clients");
// const User = require("../models/User");
const Candidate = require("./../models/Candidate");

exports.getCandidatesstats = async (req, res) => {
  const candidate = await Candidate.query().count('*')
  const Users = await Clients.query().count("*")
  // .withGraphFetched("role");
  // .where("action", "=", "approved")
  // .then((resp) => res.json(resp))
  // .catch((err) => {
  //   console.info("----------------------------");
  //   console.info("get all clients =>", err);
  //   console.info("----------------------------");
  // });
  // .withGraphFetched(
  //   "[professional.jobCategory,industries_relation.industries]"
  // )
  // .select(select)
  try {
    res.json({employer:Users,employee:candidate});
  } catch (error) {
    console.log("Candidate Filter", error);
  }
};
