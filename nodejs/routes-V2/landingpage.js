// const { statistics } = require("../controllers/landingpage");
const { getCandidatesstats, updateUserForCandidateApply } = require("../controllerV2/landingpage");

const router = require("express").Router();
// console.log(statistics())

router.get("/statistics", getCandidatesstats);
router.post("/candidate/apply/update", updateUserForCandidateApply);

module.exports = router;
