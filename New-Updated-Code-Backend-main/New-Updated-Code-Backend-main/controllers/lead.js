const Lead = require('../models/Lead')

const { fileUpload } = require('../middleware/contentful')
const { awsUploadFiles } = require('../middleware/awsS3')
exports.createLead = async (req, res) => {
  const data = req.body
  if (req?.files?.visitingCard) {
    let resp = await awsUploadFiles(req.files.image)
    data.visitingCard = `${resp.url}`
  }
  await Lead.query()
    .insert(data)
    .then((resp) => res.json(resp))
    .catch((err) => console.log('create lead err', err))
}

exports.getLead = async (req, res) => {
  try {
    let { page, perPage } = req.query
    page -= 1
    const leadFilter = req.body
    const lead_Filter_Data = await Lead.query()
      .where((builder) => {
        for (const key in leadFilter) {
          builder.andWhere(key, 'ilike', `%${leadFilter[key]}%`)
        }
      })
      .page(page, perPage)
      .andWhere('isdeleted', 0)
      .orderBy('created_at', 'desc')


    res.json(lead_Filter_Data)
  } catch (err) {
    console.log('dataa lead filter errr', err)
    res.json({ msg: err })
  }
}

exports.updateLead = async (req, res) => {
  let lead = req.body
  if (req?.files?.visitingCard) {
    let resp = await awsUploadFiles(req.files.image)
    lead.visitingCard = `${resp.url}`
  }

  try {
    let id = req.params.id
    await Lead.query().update(lead).where('id', id)
    res.json({ msg: 'success' })
  } catch (err) {
    console.log('dataa lead update errr', err)
    res.json({ msg: err })
  }
}

exports.deleteLead = async (req, res) => {
  try {
    const id = req.params.id
    await Lead.query().update({ isdeleted: 1 }).where('id', id)
    res.json({ msg: 'success' })
  } catch (err) {
    console.log('dataa Lead delete errr', err)
    res.json({ msg: err })
  }
}
