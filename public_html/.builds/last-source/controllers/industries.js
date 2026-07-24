const Industries = require('../models/Industries')

exports.createIndustries = async (req, res) => {
    const data = req.body
    await Industries.query()
        .insert(data)
        .then((r) => res.json(r))
        .catch((err) => console.log('industries create', err))
}

exports.updateIndustries = async (req, res) => {
    const id = req.params.id
    const data = req.body
    await Industries.query()
        .update(data)
        .where('id', id)

        .then(() => res.json({ msg: "success" }))
        .catch((err) => console.log('industries update', err))
}

exports.getIndustries = async (req, res) => {
    let { page, perPage } = req.query
    page -= 1
    try {
        const industriesFilter = req.body
        const industriesFilterData = await Industries.query()
            .page(page, perPage)
            .where((builder) => {
                for (const key in industriesFilter) {
                    builder.andWhere(key, 'ilike', `%${industriesFilter[key]}%`)
                }
            })
            .orderBy('created_at', 'desc')


        res.json(industriesFilterData)
    } catch (err) {
        console.log('dataa industries filter errr', err)
        res.json({ msg: err })
    }
}

exports.getAllIndustries = async (req, res) => {

    try {
        const industriesData = await Industries.query()
        res.json(industriesData)
    } catch (err) {
        console.log('dataa industries filter errr', err)
        res.json({ msg: err })
    }
}

exports.deleteIndustries = async (req, res) => {
    const id = req.params.id
    await Industries.query().deleteById(id)
        .then((r) => res.json({ msg: "success" }))
        .catch((err) => console.log('industries delete', err))
}
