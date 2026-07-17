const mongoose = require("mongoose");

const Schema = mongoose.Schema;
const model = mongoose.model;

const parameterSchema = new Schema(
  {
    type: { type: String, default: "text" },
    parameterName: String,
    text: String,
    subType: String,
    index: Number,
  },
  { _id: false }
);

const componentSchema = new Schema(
  {
    type: { type: String, default: "body" },
    parameters: [parameterSchema],
  },
  { _id: false }
);

const welcomeWhatsappConfig = new Schema(
  {
    id: { type: String, default: "welcome-whatsapp-config" },
    isEnabled: { type: Boolean, default: false },
    apiUrl: {
      type: String,
      default: "https://wa2.netsofters.com/api/external-api-bridge/send-message",
    },
    securityKey: String,
    messagingProduct: { type: String, default: "whatsapp" },
    recipientType: { type: String, default: "individual" },
    messageType: { type: String, default: "template" },
    templateName: { type: String, default: "order_confirmation" },
    templateLanguageCode: { type: String, default: "en_US" },
    countryCodePrefix: { type: String, default: "91" },
    components: {
      type: [componentSchema],
      default: [
        {
          type: "body",
          parameters: [
            {
              type: "text",
              parameterName: "first_name",
              text: "{{firstname}}",
            },
            {
              type: "text",
              parameterName: "order_number",
              text: "",
            },
          ],
        },
      ],
    },
  },
  { collection: "welcomeWhatsappConfig", timestamps: true, versionKey: false }
);

const WelcomeWhatsappConfig = model(
  "welcomeWhatsappConfig",
  welcomeWhatsappConfig
);

module.exports = WelcomeWhatsappConfig;
