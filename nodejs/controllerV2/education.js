const { v4: uuid } = require("uuid");
const Education = require("../models-v2/education_Mongoose");
const EducationCourse = require("../models-v2/educationCourse_Mongoose");
const { ensureEducationSeeded } = require("../services/educationCourseSeed");

const ACTIVE = { isdeleted: { $ne: 1 } };

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function qualificationOf(value) {
  return String(value || "").trim().toLowerCase();
}

exports.getEducations = async (req, res) => {
  try {
    await ensureEducationSeeded();
    const qualification = qualificationOf(
      req.query?.qualification || req.body?.qualification
    );
    const query = { ...ACTIVE };
    if (qualification && qualification !== "any") {
      query.qualification = qualification;
    }
    const data = await Education.find(query)
      .sort({ name: 1 })
      .select({ id: 1, name: 1, qualification: 1, _id: 0 })
      .lean();
    return res.status(200).json({ data });
  } catch (err) {
    console.log("getEducations error =>", err?.message || err);
    return res.status(500).json({ data: [], msg: "Failed to load education" });
  }
};

exports.getCourses = async (req, res) => {
  try {
    await ensureEducationSeeded();
    const educationId = String(
      req.query?.educationId || req.body?.educationId || ""
    ).trim();
    if (!educationId) {
      return res.status(200).json({ data: [], msg: "educationId is required" });
    }
    const data = await EducationCourse.find({ ...ACTIVE, educationId })
      .sort({ name: 1 })
      .select({
        id: 1,
        name: 1,
        educationId: 1,
        educationName: 1,
        qualification: 1,
        _id: 0,
      })
      .lean();
    return res.status(200).json({ data });
  } catch (err) {
    console.log("getCourses error =>", err?.message || err);
    return res.status(500).json({ data: [], msg: "Failed to load courses" });
  }
};

exports.getEducationList = async (req, res) => {
  try {
    await ensureEducationSeeded();
    const page = Math.max(1, Number(req.query?.page || 1));
    const perPage = Math.max(1, Number(req.query?.perPage || 10));
    const skip = (page - 1) * perPage;
    const body = req.body || {};
    const query = { ...ACTIVE };
    if (body.qualification) {
      query.qualification = qualificationOf(body.qualification);
    }
    if (body.name) {
      query.name = {
        $regex: escapeRegex(String(body.name).trim()),
        $options: "i",
      };
    }
    const [results, total] = await Promise.all([
      Education.find(query).sort({ createdAt: -1 }).skip(skip).limit(perPage).lean(),
      Education.countDocuments(query),
    ]);
    return res.status(200).json({ results, total });
  } catch (err) {
    console.log("getEducationList error =>", err?.message || err);
    return res.status(500).json({ results: [], total: 0, msg: "Failed" });
  }
};

exports.createEducation = async (req, res) => {
  try {
    const name = String(req.body?.name || "").trim();
    const qualification = qualificationOf(req.body?.qualification);
    if (!name || !qualification) {
      return res.json({ error: "Qualification and education name are required" });
    }
    const existing = await Education.findOne({
      ...ACTIVE,
      qualification,
      name: { $regex: `^${escapeRegex(name)}$`, $options: "i" },
    }).lean();
    if (existing) {
      return res.json({ error: "Education already exists for this qualification" });
    }
    const doc = await Education.create({
      id: uuid(),
      name,
      qualification,
      isdeleted: 0,
    });
    return res.json(doc);
  } catch (err) {
    console.log("createEducation error =>", err?.message || err);
    return res.json({ error: "create failed" });
  }
};

exports.updateEducation = async (req, res) => {
  try {
    const id = req.params.id;
    const name = String(req.body?.name || "").trim();
    const qualification = qualificationOf(req.body?.qualification);
    if (!id || !name || !qualification) {
      return res.json({ error: "id, qualification and name are required" });
    }
    const duplicate = await Education.findOne({
      ...ACTIVE,
      id: { $ne: id },
      qualification,
      name: { $regex: `^${escapeRegex(name)}$`, $options: "i" },
    }).lean();
    if (duplicate) {
      return res.json({ error: "Another education with same name exists" });
    }
    await Education.updateOne(
      { id },
      { $set: { name, qualification, updatedAt: new Date() } }
    );
    await EducationCourse.updateMany(
      { educationId: id },
      { $set: { educationName: name, qualification } }
    );
    return res.json({ msg: "success" });
  } catch (err) {
    console.log("updateEducation error =>", err?.message || err);
    return res.json({ error: "update failed" });
  }
};

exports.deleteEducation = async (req, res) => {
  try {
    const id = req.params.id;
    await Education.updateOne({ id }, { $set: { isdeleted: 1 } });
    await EducationCourse.updateMany(
      { educationId: id },
      { $set: { isdeleted: 1 } }
    );
    return res.json({ msg: "success" });
  } catch (err) {
    console.log("deleteEducation error =>", err?.message || err);
    return res.json({ error: "delete failed" });
  }
};

exports.getCourseList = async (req, res) => {
  try {
    await ensureEducationSeeded();
    const page = Math.max(1, Number(req.query?.page || 1));
    const perPage = Math.max(1, Number(req.query?.perPage || 10));
    const skip = (page - 1) * perPage;
    const body = req.body || {};
    const query = { ...ACTIVE };
    if (body.educationId) query.educationId = String(body.educationId).trim();
    if (body.qualification) {
      query.qualification = qualificationOf(body.qualification);
    }
    if (body.name) {
      query.name = {
        $regex: escapeRegex(String(body.name).trim()),
        $options: "i",
      };
    }
    const [results, total] = await Promise.all([
      EducationCourse.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(perPage)
        .lean(),
      EducationCourse.countDocuments(query),
    ]);
    return res.status(200).json({ results, total });
  } catch (err) {
    console.log("getCourseList error =>", err?.message || err);
    return res.status(500).json({ results: [], total: 0, msg: "Failed" });
  }
};

exports.createCourse = async (req, res) => {
  try {
    const name = String(req.body?.name || "").trim();
    const educationId = String(req.body?.educationId || "").trim();
    if (!name || !educationId) {
      return res.json({ error: "Education and course name are required" });
    }
    const education = await Education.findOne({ id: educationId, ...ACTIVE }).lean();
    if (!education) {
      return res.json({ error: "Education not found" });
    }
    const existing = await EducationCourse.findOne({
      ...ACTIVE,
      educationId,
      name: { $regex: `^${escapeRegex(name)}$`, $options: "i" },
    }).lean();
    if (existing) {
      return res.json({ error: "Course already exists for this education" });
    }
    const doc = await EducationCourse.create({
      id: uuid(),
      name,
      educationId,
      educationName: education.name,
      qualification: education.qualification,
      isdeleted: 0,
    });
    return res.json(doc);
  } catch (err) {
    console.log("createCourse error =>", err?.message || err);
    return res.json({ error: "create failed" });
  }
};

exports.updateCourse = async (req, res) => {
  try {
    const id = req.params.id;
    const name = String(req.body?.name || "").trim();
    const educationId = String(req.body?.educationId || "").trim();
    if (!id || !name || !educationId) {
      return res.json({ error: "id, education and course name are required" });
    }
    const education = await Education.findOne({ id: educationId, ...ACTIVE }).lean();
    if (!education) {
      return res.json({ error: "Education not found" });
    }
    const duplicate = await EducationCourse.findOne({
      ...ACTIVE,
      id: { $ne: id },
      educationId,
      name: { $regex: `^${escapeRegex(name)}$`, $options: "i" },
    }).lean();
    if (duplicate) {
      return res.json({ error: "Another course with same name exists" });
    }
    await EducationCourse.updateOne(
      { id },
      {
        $set: {
          name,
          educationId,
          educationName: education.name,
          qualification: education.qualification,
          updatedAt: new Date(),
        },
      }
    );
    return res.json({ msg: "success" });
  } catch (err) {
    console.log("updateCourse error =>", err?.message || err);
    return res.json({ error: "update failed" });
  }
};

exports.deleteCourse = async (req, res) => {
  try {
    const id = req.params.id;
    await EducationCourse.updateOne({ id }, { $set: { isdeleted: 1 } });
    return res.json({ msg: "success" });
  } catch (err) {
    console.log("deleteCourse error =>", err?.message || err);
    return res.json({ error: "delete failed" });
  }
};
