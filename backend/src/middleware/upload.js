import multer from "multer";
import path from "path";
import { ApiError } from "../utils/ApiError.js";

const TEN_MB = 10 * 1024 * 1024; // 10 MB in bytes

const ALLOWED_MIMES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png"
]);

const ALLOWED_EXTENSIONS = new Set([".pdf", ".jpg", ".jpeg", ".png"]);

/**
 * multer upload instance:
 * - memoryStorage: file bytes in req.file.buffer (never touch disk unencrypted)
 * - 10 MB size limit
 * - fileFilter: allow only pdf/jpg/png by MIME type AND extension
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: TEN_MB
  },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const mimeOk = ALLOWED_MIMES.has(file.mimetype);
    const extOk = ALLOWED_EXTENSIONS.has(ext);

    if (mimeOk && extOk) {
      cb(null, true);
    } else {
      cb(
        ApiError.badRequest(
          `Invalid file type. Only PDF, JPEG, and PNG files are allowed. ` +
          `Received MIME type: '${file.mimetype}', extension: '${ext}'.`
        )
      );
    }
  }
});

/**
 * Middleware for single file upload on field name "file".
 * Wraps multer errors into ApiError for consistent error responses.
 */
export const uploadSingle = (req, res, next) => {
  upload.single("file")(req, res, (err) => {
    if (!err) return next();

    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return next(ApiError.badRequest("File size exceeds the 10 MB limit."));
      }
      return next(ApiError.badRequest(`Upload error: ${err.message}`));
    }

    // ApiError thrown in fileFilter or other errors
    return next(err);
  });
};

export default uploadSingle;
