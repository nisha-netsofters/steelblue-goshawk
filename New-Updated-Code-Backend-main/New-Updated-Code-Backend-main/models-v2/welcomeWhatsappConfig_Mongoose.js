const mongoose = require("mongoose");

const Schema = mongoose.Schema;
const model = mongoose.model;

const keyValueSchema = new Schema(
  {
    key: { type: String, required: true },
    value: { type: String, default: "" },
  },
  { _id: false }
);

const apiConfigSchema = new Schema(
  {
    id: { type: String, required: true },
    name: { type: String, default: "API Config" },
    isEnabled: { type: Boolean, default: false },
    apiUrl: {
      type: String,
      default: "https://wa2.netsofters.com/api/external-api-bridge/send-message",
    },
    method: { type: String, default: "POST" },
    curlText: { type: String, default: "" },
    headers: { type: [keyValueSchema], default: [] },
    bodyParams: { type: [keyValueSchema], default: [] },
    countryCodePrefix: { type: String, default: "91" },
    recipientKey: { type: String, default: "to" },
    // auto | named | positional — fixes WhatsApp #132012 when template is positional
    parameterMode: { type: String, default: "auto" },
  },
  { _id: false }
);

const welcomeWhatsappConfig = new Schema(
  {
    id: { type: String, default: "welcome-whatsapp-config" },
    apis: { type: [apiConfigSchema], default: [] },
    // Legacy single-config fields (migrated into apis[] on read)
    isEnabled: { type: Boolean, default: false },
    apiUrl: String,
    method: String,
    headers: [keyValueSchema],
    bodyParams: [keyValueSchema],
    countryCodePrefix: String,
    recipientKey: String,
    securityKey: String,
    messagingProduct: String,
    recipientType: String,
    messageType: String,
    templateName: String,
    templateLanguageCode: String,
    components: { type: Array, default: [] },
  },
  { collection: "welcomeWhatsappConfig", timestamps: true, versionKey: false }
);

const WelcomeWhatsappConfig = model(
  "welcomeWhatsappConfig",
  welcomeWhatsappConfig
);

module.exports = WelcomeWhatsappConfig;
