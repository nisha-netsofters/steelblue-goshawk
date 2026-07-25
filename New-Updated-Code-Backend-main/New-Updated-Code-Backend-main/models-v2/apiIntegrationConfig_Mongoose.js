const mongoose = require("mongoose");

const Schema = mongoose.Schema;
const model = mongoose.model;

const providerCredentialsSchema = new Schema(
  {
    isEnabled: { type: Boolean, default: false },
    apiKey: { type: String, default: "" },
    projectId: { type: String, default: "" },
    accessKeyId: { type: String, default: "" },
    secretAccessKey: { type: String, default: "" },
    region: { type: String, default: "us-east-1" },
    endpoint: { type: String, default: "" },
    language: { type: String, default: "eng" },
    model: { type: String, default: "" },
    baseUrl: { type: String, default: "" },
  },
  { _id: false }
);

const apiIntegrationConfig = new Schema(
  {
    id: { type: String, default: "api-integration-config" },
    ocr: {
      isEnabled: { type: Boolean, default: false },
      activeProvider: {
        type: String,
        enum: [
          "google_vision",
          "aws_textract",
          "azure_document_intelligence",
          "tesseract",
        ],
        default: "google_vision",
      },
      providers: {
        google_vision: {
          type: providerCredentialsSchema,
          default: () => ({
            isEnabled: false,
            apiKey: "",
            projectId: "",
          }),
        },
        aws_textract: {
          type: providerCredentialsSchema,
          default: () => ({
            isEnabled: false,
            accessKeyId: "",
            secretAccessKey: "",
            region: "us-east-1",
          }),
        },
        azure_document_intelligence: {
          type: providerCredentialsSchema,
          default: () => ({
            isEnabled: false,
            endpoint: "",
            apiKey: "",
          }),
        },
        tesseract: {
          type: providerCredentialsSchema,
          default: () => ({
            isEnabled: false,
            language: "eng",
          }),
        },
      },
    },
    ai: {
      isEnabled: { type: Boolean, default: false },
      activeProvider: {
        type: String,
        enum: ["openai", "gemini", "claude"],
        default: "openai",
      },
      providers: {
        openai: {
          type: providerCredentialsSchema,
          default: () => ({
            isEnabled: false,
            apiKey: "",
            model: "gpt-4o",
            baseUrl: "https://api.openai.com/v1",
          }),
        },
        gemini: {
          type: providerCredentialsSchema,
          default: () => ({
            isEnabled: false,
            apiKey: "",
            model: "gemini-1.5-pro",
          }),
        },
        claude: {
          type: providerCredentialsSchema,
          default: () => ({
            isEnabled: false,
            apiKey: "",
            model: "claude-3-5-sonnet-20241022",
            baseUrl: "https://api.anthropic.com/v1",
          }),
        },
      },
    },
    notifications: {
      isEnabled: { type: Boolean, default: false },
      whatsapp: {
        isEnabled: { type: Boolean, default: false },
        useWelcomeWhatsappConfig: { type: Boolean, default: true },
        apiUrl: {
          type: String,
          default:
            "https://wa2.netsofters.com/api/external-api-bridge/send-message",
        },
        securityKey: { type: String, default: "" },
      },
    },
  },
  { collection: "apiIntegrationConfig", timestamps: true, versionKey: false }
);

const ApiIntegrationConfig = model("apiIntegrationConfig", apiIntegrationConfig);

module.exports = ApiIntegrationConfig;
