const JobOpening = require('../models/JobOpening')

exports.createJobOpening = async (req, res) => {
    const data = req.body
    await JobOpening.query()
        .insert(data)
        .then((r) => res.json(r))
        .catch((err) => console.log('jobOpening create err', err))
}

exports.getOnJobOpening = async (req, res) => {
    try {
        let { page, perPage, userId } = req.query
        page -= 1
        const jobOpeningFilter = await JobOpening.query()
            .withGraphFetched('jobCategory')
            .withGraphFetched('industries')
            .andWhere("userId", userId)
            .page(page, perPage)
            .orderBy('created_at', 'desc')

        res.json(jobOpeningFilter)
    } catch (err) {
        console.log('dataa JobOpening filter errr', err)
        res.json({ msg: err })
    }
}

exports.findJobOpening = async (req, res) => {
    try {
        let { id } = req.query
        const jobOpening = await JobOpening.query()
            .withGraphFetched('jobCategory')
            .withGraphFetched('industries')
            .findById(id)

        res.json(jobOpening)
    } catch (err) {
        console.log('dataa JobOpening  errr', err)
        res.json({ msg: err })
    }
}

exports.updateJobOpening = async (req, res) => {
    const data = req.body
    await JobOpening.query()
        .update(data)
        .where('id', req.params.id)
        .then((r) => res.json({ msg: 'success' }))
        .catch((err) => console.log('JobOpening update err', err))
}

exports.deleteJobOpening = async (req, res) => {
    const id = req.params.id
    await JobOpening.query().deleteById(id)
        .then((r) => res.json({ msg: 'success' }))
        .catch((err) => console.log('JobOpening delete err', err))
}
