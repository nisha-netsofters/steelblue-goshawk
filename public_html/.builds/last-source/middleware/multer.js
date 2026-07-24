const multer = require('multer')

// storage

const Storage = multer.diskStorage({
    destination: function (req, file, cb) {
        if (file.fieldname == 'resume') {
            cb(null, './uploads/resumes')
        } else if (file.fieldname == 'file') {
            cb(null, './uploads/file')
        }
        else {
            cb(null, './uploads/photos')

        }
    },
    filename: (req, file, cb) => {
        var date = String(new Date())
        cb(null, date.slice(0, 15) + file.originalname)
    },
})

exports.upload_Data = multer({
    storage: Storage,
}).any()

