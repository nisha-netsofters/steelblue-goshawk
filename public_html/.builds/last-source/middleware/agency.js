const Agency = require("../models-v2/agency_Mongooes");
const {
  deactivationMailToDhaval,
  deactivationMailToAgency,
} = require("../middleware/Emails/email");
const { enqueueEmailJob } = require("../mq/emailProducer");
exports.removeExpiredNamesformiddleware = async (req, res, next) => {
  try {
    let diactivatedAgency = 0;
    //   let cronData = await startCronTab("agency_diactivate");
    const present = new Date();
    const agencies = await Agency.find({
      exprireDate: { $lte: present },
    });
    //   await updateCronTab(cronData?.data?.id, diactivatedAgency);
    if (agencies?.length == 0) {
      //   res.json({ msg: "No agency to deactivate" });
    } else {
      for (let agency of agencies) {
        if (agency?.expirable == true) {
          await Agency.updateOne(
            { id: agency.id },
            { $set: { isDeleted: true } }
          );
          diactivatedAgency = diactivatedAgency + 1;
        }
      }
    }
    next();
  } catch (error) {}
};
exports.sendMailforAgencyDeactivationformiddleware = async (req, res, next) => {
  try {
    let sentmailtoAgency = 0;
    //   let cronData = await startCronTab("agency_deactivation_mail");
    const today = new Date();
    const yesterday = new Date(today);
    const daybeforeYesterday = new Date(today);
    yesterday.setDate(today.getDate() + 1);
    daybeforeYesterday.setDate(today.getDate() + 2);
    const yesterdayDate = new Date(yesterday);
    const daybeforeyesterdayDate = new Date(daybeforeYesterday);
    const yesterdayDateString = yesterdayDate.toISOString().split("T")[0];
    const dayBeforeYesterdayDateString = daybeforeyesterdayDate
      .toISOString()
      .split("T")[0];
    const agenciesYesterday = await Agency.aggregate([
      {
        $match: {
          $expr: {
            $eq: [
              { $dateToString: { format: "%Y-%m-%d", date: "$exprireDate" } },
              yesterdayDateString,
            ],
          },
        },
      },
    ]);

    const agenciesDayBeforeYesterday = await Agency.aggregate([
      {
        $match: {
          $expr: {
            $eq: [
              { $dateToString: { format: "%Y-%m-%d", date: "$exprireDate" } },
              dayBeforeYesterdayDateString,
            ],
          },
        },
      },
    ]);

    for (let agency of agenciesDayBeforeYesterday) {
      if (
        agency?.expirable == true &&
        agency?.sentmail == false &&
        agency?.firstmail == false
      ) {
        await Agency.updateOne(
          { id: agency.id },
          { $set: { firstmail: true } }
        );
        sentmailtoAgency = sentmailtoAgency + 1;
        await enqueueEmailJob("agencyDeactivationAgency", {
          agencyownername: agency?.ownersName,
          email: agency?.email,
        });
      }
    }
    for (let agency of agenciesYesterday) {
      if (agency?.expirable == true && agency?.sentmail == false) {
        await Agency.updateOne({ id: agency.id }, { $set: { sentmail: true } });
        await enqueueEmailJob("agencyDeactivationDhaval", {
          agencyownername: agency?.ownersName,
          expireDate: new Date(agency?.exprireDate).toLocaleDateString(),
        });
        await enqueueEmailJob("agencyDeactivationAgency", {
          agencyownername: agency?.ownersName,
          email: agency?.email,
        });
        sentmailtoAgency = sentmailtoAgency + 1;
      }
    }
    //   await updateCronTabforMail(cronData?.data?.id, sentmailtoAgency);
    next();
  } catch (error) {
    // res.json({ msg: "Something failed" });
    // next();
  }
};
