const app = require("./app");
const { startWorker } = require("./mq/emailWorker");

const port = Number(process.env.PORT) || 7001;
const host = process.env.HOST || "0.0.0.0";

function afterListen(label) {
  console.log("Listening on " + label);
  startWorker().catch((err) => {
    console.error("Email worker failed to start:", err.message);
  });
}

try {
  // Hostinger Web App / Passenger both inject PORT when present.
  if (typeof PhusionPassenger !== "undefined") {
    PhusionPassenger.configure({ autoInstall: false });
    app.listen("passenger", () => afterListen("passenger"));
  } else {
    app.listen(port, host, () => afterListen(host + ":" + port));

    // Local-only helper port for resume chunk uploads
    if (process.env.NODE_ENV !== "production" && port !== 8080) {
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
} catch (err) {
  console.error("Failed to start server:", err);
  process.exit(1);
}

module.exports = app;
