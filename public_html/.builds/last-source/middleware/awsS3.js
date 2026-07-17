// const S3 = require("aws-sdk/clients/s3");

// // uploads a file to s3
// const awsBUCKET_NAME = "unique-world-pro";
// const awsRegion = "us-east-1";
// const awsAccessKey = "AKIASEKBLWGMFARUXN5Y";
// const awsSecretKey = "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";

// const s3 = new S3({
//   region: awsRegion,
//   accessKeyId: awsAccessKey,
//   secretAccessKey: awsSecretKey,
// });

// exports.awsuploadFiles = async (file) => {
//   const fileName = Date.now() + file.name;
//   const uploadLink = await s3
//     .upload({
//       Bucket: awsBUCKET_NAME,
//       Body: file.data,
//       Key: "assets/" + fileName,
//     })
//     .promise();
//   return uploadLink?.Location
//     ? { url: uploadLink?.Location, success: true }
//     : { url: null, success: false };
// };

// // export const uploadToS3 = async (
// //   data: any,
// //   name: string,
// //   folder: string,
// //   contentType: string
// // ): Promise<any> => {
// //   const bucketParams = {
// //     Bucket: "yarnit-public-dev-1",
// //     // Specify the name of the new object. For example, 'index.html'.
// //     // To create a directory for the object, use '/'. For example, 'myApp/package.json'.
// //     Key: folder + "/" + name,
// //     // Content of the new object.
// //     Body: data,
// //     ContentEncoding: "base64",
// //     ContentType: contentType, //'image/jpeg'
// //   };

// //   try {
// //     const data = await s3Client.send(new PutObjectCommand(bucketParams));
// //     //return data; // For unit tests.
// //     console.log(
// //       "Successfully uploaded object: " +
// //         bucketParams.Bucket +
// //         "/" +
// //         bucketParams.Key
// //     );
// //     return (
// //       "https://" +
// //       bucketParams.Bucket +
// //       ".s3.ap-south-1.amazonaws.com/" +
// //       bucketParams.Key
// //     );
// //   } catch (err) {
// //     console.log("Error", err);
// //     return "";
// //   }
// // };
