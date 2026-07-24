const { v4: uuidv4 } = require('uuid');

exports.seed = function (knex, Promise) {
    // Deletes ALL existing entries
    return knex('role').del()
        .then(function () {
            // Inserts seed entries
            return knex('role').insert([
                { id: uuidv4(), name: 'Admin' },
                { id: uuidv4(), name: 'BDM' },
                { id: uuidv4(), name: 'Team Leader' },
                { id: uuidv4(), name: 'Recruiter' },
                { id: uuidv4(), name: 'Client' }
            ]);
        });
};
