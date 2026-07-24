const ClientFeedback = require('../models/ClientFeedBack')

exports.createClientFeedback = async (req, res) => {
  const data = req.body
  await ClientFeedback.query()
    .insert(data)
    .then((resp) => res.json(resp))
    .catch((err) => console.log('create client Feedback err', err))
}

exports.getClientFeedback = async (req, res) => {
  try {
    let { page, perPage } = req.query
    page -= 1
    const clientFeedbackFilter = req.body
    const clientFeedback_Filter_Data = await ClientFeedback.query()
      .where((builder) => {
        for (const key in clientFeedbackFilter) {
          if (key === 'onBoardingId') {
            builder.andWhere(key, `${clientFeedbackFilter[key]}`)
          } else {
            builder.andWhere(key, 'ilike', `%${clientFeedbackFilter[key]}%`)
          }
        }
      })
      .page(page, perPage)
      .andWhere('isdeleted', 0)
      .withGraphFetched("clients")
      .orderBy('created_at', 'desc')

      .withGraphFetched('onBoarding')

    res.json(clientFeedback_Filter_Data)
  } catch (err) {
    console.log('dataa ClientFeedback filter errr', err)
    res.json({ msg: err })
  }
}

exports.updateClientFeedback = async (req, res) => {
  let clientFeedback = req.body
  try {
    let id = req.params.id
    await ClientFeedback.query().update(clientFeedback).where('id', id)
    res.json({ msg: 'success' })
  } catch (err) {
    console.log('dataa clientFeedback update errr', err)
    res.json({ msg: err })
  }
}

exports.deleteClientFeedback = async (req, res) => {
  try {
    const id = req.params.id
    await ClientFeedback.query().update({ isdeleted: 1 }).where('id', id)
    res.json({ msg: 'success' })
  } catch (err) {
    console.log('dataa clientFeedback delete errr', err)
    res.json({ msg: err })
  }
}
