const mongoose = require("mongoose");
const ResumeEnquiry = require("../models-v2/resumeEnquiry_Mongoose");
const Candidates = require("../models-v2/candidates_Mongoose");

exports.createResumeEnquiry = async (req, res) => {
  try {
    const authUser = req.user;
    const agencyId = req.headers["agencyid"] || authUser?.agencyId;
    const { userId, message } = req.body;

    if (!authUser || !authUser.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }
    const candidate = await Candidates.findOne({ userId });
    if (!candidate) {
      return res.status(404).json({ error: "Candidate not found" });
    }
    const existingEnquiry = await ResumeEnquiry.findOne({ userId, agencyId, status: "requested" });
    if (existingEnquiry) {
      return res.status(400).json({ error: "Enquiry already requested" });
    }
    const objectId = new mongoose.Types.ObjectId();
    const enquiry = await ResumeEnquiry.create({
      id: objectId,
      _id: objectId,
      candidateId: candidate.id,
      userId,
      agencyId: agencyId || null,
      status: "requested",
      message: message || "",
    });

    return res.json({ msg: "success", data: enquiry });
  } catch (err) {
    console.log("createResumeEnquiry error", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

exports.getResumeEnquiries = async (req, res) => {
  try {
    let { page, perPage } = req.query;
    page = Number(page || 1) - 1;
    perPage = Number(perPage || 10);
    const agencyId = req.headers["agencyid"] || req.user?.agencyId;

    const match = {};
    if (agencyId) match.agencyId = agencyId;

    // Add status filtering
    if (req.body?.status) {
      if (Array.isArray(req.body.status)) {
        // Multiple statuses
        match.status = { $in: req.body.status };
      } else {
        // Single status
        match.status = req.body.status;
      }
    }

    const list = await ResumeEnquiry.aggregate([
      { $sort: { createdAt: -1 } },
      { $match: match },
      {
        $lookup: {
          from: "candidates",
          localField: "candidateId",
          foreignField: "id",
          as: "candidate",
        },
      },
      { $addFields: { candidate: { $arrayElemAt: ["$candidate", 0] } } },
      { $match: { candidate: { $ne: null } } },
      {
        $facet: {
          data: [{ $skip: page * perPage }, { $limit: perPage }],
          count: [{ $count: "total" }],
        },
      },
    ]);

    return res.json({ results: list[0]?.data || [], total: list[0]?.count[0]?.total || 0 });
  } catch (err) {
    console.log("getResumeEnquiries error", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

exports.getResumeEnquiryView = async (req, res) => {
  try {
    const id = req.params.id;
    if (!id) {
      return res.status(400).json({ error: "id is required" });
    }
    const agencyId = req.headers["agencyid"] || req.user?.agencyId;
    const match = { id };
    if (agencyId) match.agencyId = agencyId;

    const data = await ResumeEnquiry.aggregate([
      { $match: match },
      {
        $lookup: {
          from: "candidates",
          localField: "candidateId",
          foreignField: "id",
          as: "candidate",
        },
      },
      { $addFields: { candidate: { $arrayElemAt: ["$candidate", 0] } } },
    ]);

    return res.json(data[0] || {});
  } catch (err) {
    console.log("getResumeEnquiryView error", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

exports.updateResumeEnquiryStatus = async (req, res) => {
  try {
    const { id, status } = req.body;
    const authUser = req.user;
    const allowed = ["requested", "completed", "rejected", "inreview"];

    if (!authUser || !authUser.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (authUser?.role?.name === "Candidate") {
      return res.status(403).json({ error: "Access denied" });
    }
    if (!id || !allowed.includes(status)) {
      return res.status(400).json({ error: "Invalid id or status" });
    }

    const agencyId = req.headers["agencyid"] || authUser?.agencyId;
    const match = { id };
    if (agencyId) match.agencyId = agencyId;

    const enquiry = await ResumeEnquiry.findOne(match);
    if (!enquiry) {
      return res.status(404).json({ error: "Enquiry not found" });
    }

    await ResumeEnquiry.updateOne({ id: enquiry.id }, { $set: { status } });
    const updated = await ResumeEnquiry.findOne({ id: enquiry.id });
    return res.json({ msg: "success", data: updated });
  } catch (err) {
    console.log("updateResumeEnquiryStatus error", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

exports.getResumeEnquiryStatus = async (req, res) => {
  try {
    const userId = req.params.userId;
    const authUser = req.user;
    const agencyId = req.headers["agencyid"] || authUser?.agencyId;

    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    const match = { userId };
    if (agencyId) match.agencyId = agencyId;

    const latest = await ResumeEnquiry.find(match).sort({ createdAt: -1 }).limit(1);
    const enquiry = latest[0] || null;
    const status = enquiry?.status || null;
    const canApply = status === "completed";

    return res.json({ status, canApply, enquiry });
  } catch (err) {
    console.log("getResumeEnquiryStatus error", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};
