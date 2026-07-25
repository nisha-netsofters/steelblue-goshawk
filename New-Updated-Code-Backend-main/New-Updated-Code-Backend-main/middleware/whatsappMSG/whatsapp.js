const axios = require('axios');
const https = require('https');

const apiUrl = process?.env?.WHATSAPP_LINK;
const key = process?.env?.WHATSAPP_KEY;

exports.sendWhatsappMSG = async (client, candidate) => {
  const msg = await msgWriter(client, candidate);
  const agent = new https.Agent({ rejectUnauthorized: false });
  const response = await axios
    .get(`${apiUrl}?key=${key}&to=91${Number(client?.mobile)}&message=${msg}`, {
      httpsAgent: agent,
      timeout: 5000,
    })
    .then((response) => {
      return response.data;
    })
    .catch((error) => {
      console.info("--------------------");
      console.info("error", error);
      console.info("--------------------");
    });

  if (response) {
    return response;
    return true;
  }
};

const msgWriter = async (client, candidate) => {
  return `Dear *${client?.companyName?.charAt(0).toUpperCase() + client?.companyName?.slice(1)}*,%0A%0A
  New CV match with Your Requirement. %0A%0A
    Name: *${candidate?.firstname}*%0A
    Gender: *${candidate?.gender}*%0A
    Mobile: *${candidate?.mobile}*%0A
    Exp: *${candidate?.professional?.experienceInyear == null || candidate?.professional?.experienceInyear == 'null' || candidate?.professional?.experienceInyear == undefined ? "-" : candidate?.professional?.experienceInyear}*%0A
    Skill: *${candidate?.professional?.skill == null || candidate?.professional?.skill == 'null' || candidate?.professional?.skill == undefined ? "-" : candidate?.professional?.skill}*%0A
    City: *${candidate?.city}*%0A
    Job Search Area: *${candidate?.professional?.preferedJobLocation}*%0A%0A

${
(  candidate?.resume != null &&
  candidate?.resume != undefined &&
  candidate?.resume != "null")
    ? "For More Detail Download CV from Below Link:%0A" : ""
}
${
  candidate?.resume == null ||
  candidate?.resume == undefined ||
  candidate?.resume == "null"
    ? "Please contact *Unique World Placement* for more detail."
    : encodeURIComponent(candidate?.resume)
}%0A%0A
Thanks,%0A
Team *Unique World Placement*%0A
*http://portal.uniqueworldjobs.com*`;
};
