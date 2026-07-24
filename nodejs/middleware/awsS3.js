const path = require("path");
const fs = require("fs");

// Local file upload fallback (used when AWS S3 is not configured)
// Saves uploaded files to the local /uploads directory and returns a URL

const UPLOADS_DIR = path.join(__dirname, "../uploads");

/**
 * Upload a file locally (Express-fileupload file object).
 * Returns an object { url, success } compatible with the old AWS upload response.
 */
exports.awsUploadFiles = async (file) => {
  try {
    // Determine sub-directory by mime type
    const isImage = file.mimetype && file.mimetype.startsWith("image/");
    const subDir = isImage ? "photos" : "file";
    const destDir = path.join(UPLOADS_DIR, subDir);

    // Create directory if it doesn't exist
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    const fileName = Date.now() + "_" + (file.name || "upload");
    const destPath = path.join(destDir, fileName);

    // Move file to destination (express-fileupload provides mv())
    await new Promise((resolve, reject) => {
      file.mv(destPath, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Return URL relative to backend root  
    const url = `/uploads/${subDir}/${fileName}`;
    return { url, success: true };
  } catch (err) {
    console.error("Local file upload error:", err.message);
    return { url: null, success: false };
  }
};
