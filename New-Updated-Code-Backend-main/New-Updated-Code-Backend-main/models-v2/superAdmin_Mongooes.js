const mongoose = require("mongoose");

const Schema = mongoose.Schema;
const model = mongoose.model;

const users = new Schema(
    {
        id: {
            type: String,
        },
        name: String,
        email: String,
        password: String,
        mobile: String,
        address: String,
        image: String,
        createdAt: String,
        updatedAt: String,
    },
    { collection: "superAdmin" }
);

const SuperAdmin = model("superAdmin", users);
module.exports = SuperAdmin;
