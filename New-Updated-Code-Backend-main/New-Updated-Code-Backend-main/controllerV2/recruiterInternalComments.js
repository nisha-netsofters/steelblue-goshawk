const { default: mongoose } = require("mongoose");
const RecruiterInternalComments = require("../models-v2/recruiterInternalComments_Mongoose");

const STAFF_ROLES = [
  "Admin",
  "SuperAdmin",
  "Team Leader",
  "BDM",
  "Recruiter",
  "Staff",
];

const getRoleName = (user) => user?.role?.name || "";

const isStaff = (user) => STAFF_ROLES.includes(getRoleName(user));

const isAdmin = (user) =>
  ["Admin", "SuperAdmin"].includes(getRoleName(user));

const isClient = (user) =>
  getRoleName(user) === "Client" || !!user?.clients;

const isCandidate = (user) => getRoleName(user) === "Candidate";

exports.createRecruiterInternalComment = async (req, res) => {
  try {
    const authUser = req.user;
    if (!isStaff(authUser)) {
      return res.status(403).json({ msg: "Not allowed to add internal comments" });
    }

    const { candidateId, comment, visibleToClient } = req.body;
    if (!candidateId || !comment?.trim()) {
      return res.status(400).json({ msg: "candidateId and comment are required" });
    }

    const agencyId = req.headers["agencyid"];
    const objectId = new mongoose.Types.ObjectId();

    const created = await RecruiterInternalComments.create({
      _id: objectId,
      id: String(objectId),
      candidateId,
      userId: authUser.id,
      authorName: authUser.name || authUser.email || "Recruiter",
      agencyId,
      comment: comment.trim(),
      visibleToClient: !!visibleToClient,
      isdeleted: 0,
    });

    return res.json(created);
  } catch (err) {
    console.log("create recruiter internal comment err", err);
    return res.status(500).json({ msg: err?.message || "Failed to create comment" });
  }
};

exports.getRecruiterInternalComments = async (req, res) => {
  try {
    const authUser = req.user;
    if (isCandidate(authUser)) {
      return res.status(403).json({ msg: "Not allowed" });
    }

    const agencyId = req.headers["agencyid"];
    const { candidateId } = req.body;
    if (!candidateId) {
      return res.status(400).json({ msg: "candidateId is required" });
    }

    let { page = 1, perPage = 50 } = req.query;
    page = Number(page) - 1;
    perPage = Number(perPage) || 50;

    const match = {
      candidateId,
      agencyId,
      isdeleted: 0,
    };

    // Clients only see comments explicitly enabled for them
    if (isClient(authUser) && !isStaff(authUser)) {
      match.visibleToClient = true;
    } else if (!isStaff(authUser)) {
      return res.status(403).json({ msg: "Not allowed" });
    }

    const [data, countAgg] = await Promise.all([
      RecruiterInternalComments.aggregate([
        { $match: match },
        { $sort: { createdAt: -1 } },
        { $skip: page * perPage },
        { $limit: perPage },
        {
          $lookup: {
            from: "users",
            localField: "userId",
            foreignField: "id",
            as: "user",
            pipeline: [{ $project: { password: 0 } }],
          },
        },
        {
          $addFields: {
            user: { $arrayElemAt: ["$user", 0] },
          },
        },
        {
          $addFields: {
            authorName: {
              $ifNull: ["$authorName", "$user.name"],
            },
          },
        },
      ]),
      RecruiterInternalComments.countDocuments(match),
    ]);

    return res.json({
      results: data,
      total: countAgg,
    });
  } catch (err) {
    console.log("get recruiter internal comments err", err);
    return res.status(500).json({ msg: err?.message || "Failed to fetch comments" });
  }
};

exports.updateRecruiterInternalComment = async (req, res) => {
  try {
    const authUser = req.user;
    if (!isStaff(authUser)) {
      return res.status(403).json({ msg: "Not allowed" });
    }

    const id = req.params.id;
    const existing = await RecruiterInternalComments.findOne({
      id,
      isdeleted: 0,
    });

    if (!existing) {
      return res.status(404).json({ msg: "Comment not found" });
    }

    // Edit own comment only (Admin can edit any)
    if (!isAdmin(authUser) && existing.userId !== authUser.id) {
      return res.status(403).json({ msg: "You can only edit your own comments" });
    }

    const update = {};
    if (typeof req.body.comment === "string") {
      if (!req.body.comment.trim()) {
        return res.status(400).json({ msg: "Comment cannot be empty" });
      }
      update.comment = req.body.comment.trim();
    }
    if (typeof req.body.visibleToClient === "boolean") {
      update.visibleToClient = req.body.visibleToClient;
    }

    await RecruiterInternalComments.updateOne({ id }, { $set: update });
    const updated = await RecruiterInternalComments.findOne({ id });
    return res.json(updated);
  } catch (err) {
    console.log("update recruiter internal comment err", err);
    return res.status(500).json({ msg: err?.message || "Failed to update comment" });
  }
};

exports.deleteRecruiterInternalComment = async (req, res) => {
  try {
    const authUser = req.user;
    if (!isStaff(authUser)) {
      return res.status(403).json({ msg: "Not allowed" });
    }

    const id = req.params.id;
    const existing = await RecruiterInternalComments.findOne({
      id,
      isdeleted: 0,
    });

    if (!existing) {
      return res.status(404).json({ msg: "Comment not found" });
    }

    // Delete own comment; Admin can delete any
    if (!isAdmin(authUser) && existing.userId !== authUser.id) {
      return res.status(403).json({ msg: "You can only delete your own comments" });
    }

    await RecruiterInternalComments.updateOne({ id }, { isdeleted: 1 });
    return res.json({ msg: "success" });
  } catch (err) {
    console.log("delete recruiter internal comment err", err);
    return res.status(500).json({ msg: err?.message || "Failed to delete comment" });
  }
};
