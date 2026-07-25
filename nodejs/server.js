const app = require("./app");
const { startWorker } = require("./mq/emailWorker");

const port = process.env.PORT || 7001;
const isPassenger = typeof PhusionPassenger !== "undefined";

function afterListen(label) {
  console.log("Listening on port: " + label);
  startWorker().catch((err) => {
    console.error("Email worker failed to start:", err.message);
  });
}

// Hostinger / Phusion Passenger: do not bind a second hardcoded port.
if (isPassenger) {
  PhusionPassenger.configure({ autoInstall: false });
  app.listen("passenger", () => afterListen("passenger"));
} else {
  app.listen(port, () => afterListen(String(port)));

  // Local-only helper port for resume chunk uploads
  if (process.env.NODE_ENV !== "production" && String(port) !== "8080") {
    app
      .listen(8080, () => {
        console.log(
          "Also listening on port: 8080 for /resume-upload chunk requests"
        );
      })
      .on("error", (err) => {
        console.log("Port 8080 listen error:", err.message);
      });
  }
}

module.exports = app;
