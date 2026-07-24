"use strict";
const app = require("./app");
const serverless = require("serverless-http");

app.use('/', (req, res) => {
    res.status(200).send({ message: 'Welcome to uniqueworld backend' })
});


const handler = serverless(app);
module.exports.handler = async (event, context) => {
    // you can do other things here
    const result = await handler(event, context);
    // and here
    return result;
};