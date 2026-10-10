import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { User } from "../models/User.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const authenticate = asyncHandler(async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw ApiError.unauthorized("Authentication required. Please provide a Bearer token.");
  }

  const token = authHeader.split(" ")[1];

  if (!token) {
    throw ApiError.unauthorized("Authentication token missing.");
  }

  const decoded = jwt.verify(token, env.JWT_SECRET);

  const user = await User.findById(decoded.id);

  if (!user) {
    throw ApiError.unauthorized("User account no longer exists.");
  }

  if (!user.isActive) {
    throw ApiError.forbidden("User account has been deactivated.");
  }

  req.user = user;
  next();
});

export default authenticate;
