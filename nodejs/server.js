const app = require("./app");
const port = process.env.PORT || 7001;
const { startWorker } = require("./mq/emailWorker");

app.listen(port, () => {
  console.log("Listening on port: " + port);
  startWorker().catch((err) => {
    console.error("Email worker failed to start:", err.message);
  });
});

if (port !== 8080) {
  app.listen(8080, () => {
    console.log("Also listening on port: 8080 for /resume-upload chunk requests");
  }).on('error', (err) => {
    console.log("Port 8080 listen error:", err.message);
  });
}
