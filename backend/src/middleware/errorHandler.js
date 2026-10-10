import { ApiError } from "../utils/ApiError.js";

export const errorHandler = (err, req, res, next) => {
  let error = err;

  // Handle Mongoose duplicate key error (code 11000)
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || "field";
    const value = err.keyValue ? err.keyValue[field] : "";
    error = ApiError.conflict(
      `Duplicate value entered for ${field}: "${value}". Please use another value.`
    );
  }

  // Handle Mongoose validation errors
  if (err.name === "ValidationError") {
    const messages = Object.values(err.errors || {}).map((val) => val.message);
    error = ApiError.badRequest("Validation failed", messages);
  }

  // Handle CastError (invalid ObjectId)
  if (err.name === "CastError") {
    error = ApiError.badRequest(`Invalid resource ID: ${err.value}`);
  }

  // Handle JWT errors
  if (err.name === "JsonWebTokenError") {
    error = ApiError.unauthorized("Invalid authorization token");
  }
  if (err.name === "TokenExpiredError") {
    error = ApiError.unauthorized("Authorization token has expired");
  }

  const statusCode = error.statusCode || 500;
  const message = error.message || "Internal server error";

  const response = {
    success: false,
    message,
    ...(error.errors && error.errors.length > 0 && { errors: error.errors }),
    ...(process.env.NODE_ENV === "development" && { stack: err.stack })
  };

  if (statusCode === 500) {
    console.error("Unhandled Server Error:", err);
  }

  res.status(statusCode).json(response);
};

export default errorHandler;
