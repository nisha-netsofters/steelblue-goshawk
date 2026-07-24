const {
  getAllPlans,
  createPlans,
  getPlanbyId,
} = require("../controllerV2/plans");
const { verifyAuth } = require("../middleware/auth");

const route = require("express").Router();
route.get("/plans", verifyAuth, getAllPlans);
route.post("/getplanbyid", verifyAuth, getPlanbyId);
route.post("/plans/create", verifyAuth, createPlans);

module.exports = route;
