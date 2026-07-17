const { getAllPlans, createPlans } = require("../controllers/plans");
const { verifyAuth } = require("../middleware/auth");

const route = require("express").Router();

route.get("/plans", verifyAuth, getAllPlans);
route.post("/plans/create", createPlans);

module.exports = route;
