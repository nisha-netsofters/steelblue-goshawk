const router = require("express").Router();
const { verifyAuth } = require("../middleware/auth");

const {
  createClientFeedback,
  updateClientFeedback,
  deleteClientFeedback,
} = require("../controllerV2/clientFeedback");
const { getClientFeedback } = require("../controllerV2/clientFeedback");

// done
router.post("/clientfeedback/create", verifyAuth, createClientFeedback);
router.post("/clientfeedback", verifyAuth, getClientFeedback);
router.put("/clientfeedback/update/:id", verifyAuth, updateClientFeedback);
router.delete("/clientfeedback/delete/:id", verifyAuth, deleteClientFeedback);

module.exports = router;
