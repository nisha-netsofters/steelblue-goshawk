const { sendTestEmail } = require("./email");

(async () => {
  const ok = await sendTestEmail();
  console.log("Test email sent:", ok);
})();