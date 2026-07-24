require("dotenv").config();
const pg = require("pg");
pg.defaults.ssl = false;

console.info("----------------------------");
console.info("process.env.POSTGRES_DEV_HOST =>", process.env.NODE_ENV);
console.info("----------------------------");


module.exports = {
    local: {
        client: "pg",
        useNullAsDefault: true,
        connection: {
            host: process.env.POSTGRES_DEV_HOST,
            port: process.env.POSTGRES_DEV_PORT,
            user: process.env.POSTGRES_DEV_USER,
            password: process.env.POSTGRES_DEV_PASSWORD,
            database: process.env.POSTGRES_DEV_DATABASE,
        },
        migrations: {
            directory: "./db/migrations",
        },
        seeds: {
            directory: "./db/seeds",
        },
    },
    development: {
        client: "pg",
        useNullAsDefault: true,
        connection: {
            host: 'postgresql-102173-0.cloudclusters.net',
            port: 19077,
            user: "unique_world",
            password: "unique_world",
            database: "unique_world",
        },
        migrations: {
            directory: "./db/migrations",
        },
        seeds: {
            directory: "./db/seeds",
        },
    },
    staging: {
        client: "pg",
        useNullAsDefault: true,
        connection: {
            host: process.env.POSTGRES_STAGING_HOST || 'postgresql-114698-0.cloudclusters.net',
            port: process.env.POSTGRES_STAGING_PORT || 19416,
            user: process.env.POSTGRES_STAGING_USER || "unique_world",
            password: process.env.POSTGRES_STAGING_PASSWORD || "unique_world",
            database: process.env.POSTGRES_STAGING_DATABASE || "unique_world",
        },
        migrations: {
            directory: "./db/migrations",
        },
        seeds: {
            directory: "./db/seeds",
        },
    },
    production: {
        client: "pg",
        useNullAsDefault: true,
        connection: {
            host: 'postgresql-114698-0.cloudclusters.net',
            port: 19416,
            user: "unique_world",
            password: "unique_world",
            database: "unique_world",
        },
        migrations: {
            directory: "./db/migrations",
        },
        seeds: {
            directory: "./db/seeds",
        },
    },

};
