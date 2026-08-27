const { v4: uuid } = require("uuid");
const Area = require("../models-v2/areas_Mongoose");

/**
 * Dropdown lookup — used by candidate form (unchanged behavior).
 * GET/POST /areas?state=&city=
 */
exports.getAreas = async (req, res) => {
  try {
    const state = String(req.query?.state || req.body?.state || "").trim();
    const city = String(req.query?.city || req.body?.city || "").trim();

    if (!city) {
      return res.status(200).json({ data: [], msg: "city is required" });
    }

    const filter = {
      isActive: { $ne: false },
      city: { $regex: `^${escapeRegex(city)}$`, $options: "i" },
    };
    if (state) {
      filter.state = { $regex: `^${escapeRegex(state)}$`, $options: "i" };
    }

    const areas = await Area.find(filter)
      .sort({ name: 1 })
      .select({ id: 1, name: 1, city: 1, state: 1, _id: 0 })
      .lean();

    return res.status(200).json({ data: areas });
  } catch (err) {
    console.log("getAreas error =>", err?.message || err);
    return res.status(500).json({ data: [], msg: "Failed to load areas" });
  }
};

/**
 * Super Admin paginated list.
 * POST /areas/list?page=&perPage=
 * body: { state?, city?, name? }
 */
exports.getAreasList = async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query?.page || 1));
    const perPage = Math.max(1, Number(req.query?.perPage || 10));
    const skip = (page - 1) * perPage;
    const body = req.body || {};

    const query = {};
    if (body.state) {
      query.state = { $regex: escapeRegex(String(body.state).trim()), $options: "i" };
    }
    if (body.city) {
      query.city = { $regex: escapeRegex(String(body.city).trim()), $options: "i" };
    }
    if (body.name) {
      query.name = { $regex: escapeRegex(String(body.name).trim()), $options: "i" };
    }

    const [results, total] = await Promise.all([
      Area.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(perPage)
        .lean(),
      Area.countDocuments(query),
    ]);

    return res.status(200).json({ results, total });
  } catch (err) {
    console.log("getAreasList error =>", err?.message || err);
    return res.status(500).json({ results: [], total: 0, msg: "Failed" });
  }
};

exports.createArea = async (req, res) => {
  try {
    const state = String(req.body?.state || "").trim();
    const city = String(req.body?.city || "").trim();
    const name = String(req.body?.name || "").trim();
    if (!state || !city || !name) {
      return res.json({ error: "state, city and area name are required" });
    }

    const existing = await Area.findOne({
      state: { $regex: `^${escapeRegex(state)}$`, $options: "i" },
      city: { $regex: `^${escapeRegex(city)}$`, $options: "i" },
      name: { $regex: `^${escapeRegex(name)}$`, $options: "i" },
    }).lean();
    if (existing) {
      return res.json({ error: "Area already exists for this city" });
    }

    const id = uuid();
    const doc = await Area.create({
      id,
      state,
      city,
      name,
      isActive: true,
    });
    return res.json(doc);
  } catch (err) {
    console.log("createArea error =>", err?.message || err);
    return res.json({ error: "create failed" });
  }
};

exports.updateArea = async (req, res) => {
  try {
    const id = req.params.id;
    const state = String(req.body?.state || "").trim();
    const city = String(req.body?.city || "").trim();
    const name = String(req.body?.name || "").trim();
    if (!id || !state || !city || !name) {
      return res.json({ error: "id, state, city and area name are required" });
    }

    const duplicate = await Area.findOne({
      id: { $ne: id },
      state: { $regex: `^${escapeRegex(state)}$`, $options: "i" },
      city: { $regex: `^${escapeRegex(city)}$`, $options: "i" },
      name: { $regex: `^${escapeRegex(name)}$`, $options: "i" },
    }).lean();
    if (duplicate) {
      return res.json({ error: "Another area with same name exists for this city" });
    }

    await Area.updateOne(
      { id },
      { $set: { state, city, name, updatedAt: new Date() } }
    );
    return res.json({ msg: "success" });
  } catch (err) {
    console.log("updateArea error =>", err?.message || err);
    return res.json({ error: "update failed" });
  }
};

exports.deleteArea = async (req, res) => {
  try {
    const id = req.params.id;
    await Area.deleteOne({ id });
    return res.json({ msg: "success" });
  } catch (err) {
    console.log("deleteArea error =>", err?.message || err);
    return res.json({ error: "delete failed" });
  }
};

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
