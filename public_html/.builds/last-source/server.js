const app = require("./app");
const port = process.env.PORT || 7001;
const { startWorker } = require("./mq/emailWorker");

app.listen(port, () => {
  console.log("Listening on port: " + port);
  // start email worker
  startWorker();
});
