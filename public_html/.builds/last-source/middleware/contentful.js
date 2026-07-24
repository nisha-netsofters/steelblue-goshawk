const contentful = require('contentful-management')

const client = contentful.createClient({
  // accessToken: 'CFPAT-Uhc2CaUP3pyWKPs4CzH9ygkNC-nbUIWB0SEhleMsUGg',
  accessToken: 'CFPAT-bBaEqHhE6FtPIVWcyhBrIKuRBu76ja-pYVzx4pt1ZA4', // production
})

exports.fileUpload = async (files) => {

  const fileUpload = await client
    .getSpace('re07v1jqbvra') // production
    // .getSpace('wn8ncefheaee')
    .then((space) => space.getEnvironment('master'))
    .then((environment) =>
      environment.createAssetFromFiles({
        fields: {
          title: {
            'en-US': 'Asset title',
          },
          description: {
            'en-US': 'Asset description',
          },
          // file: file.file
          file: {
            'en-US': {
              contentType: files.mimetype,
              fileName: files.name,
              file: files.data,
            },
          },
        },
      }),
    )
    .then((asset) => asset.processForAllLocales())
    .then((asset) => asset.publish())
    .catch(console.error)

  return await fileUpload.fields.file['en-US']
}

// exports.resumeUpload = async (files) => {
//   const resumeUpload = await client
//     .getSpace('wn8ncefheaee')
//     .then((space) => space.getEnvironment('master'))
//     .then((environment) =>
//       environment.createAssetFromFiles({
//         fields: {
//           title: {
//             'en-US': 'Asset title',
//           },
//           description: {
//             'en-US': 'Asset description',
//           },
//           // file: file.file

//           file: {
//             'en-US': {
//               contentType: files.resume.mimetype,
//               fileName: files.resume.name,
//               file: files.resume.data,
//             },
//           },
//         },
//       }),
//     )
//     .then((asset) => asset.processForAllLocales())
//     .then((asset) => asset.publish())
//     .catch(console.error)

//   return await resumeUpload.fields.file['en-US']
// }
