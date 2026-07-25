// const { statistics } = require("../controllers/landingpage");
const { getCandidatesstats } = require("../controllers/landingpage");

const router = require("express").Router();
// console.log(statistics())

router.get("/statistics", getCandidatesstats);

module.exports = router;
