import { ApiError } from "../utils/ApiError.js";

/**
 * Middleware to restrict route access to specific roles
 * @param  {...string} roles - e.g. 'admin', 'doctor', 'patient'
 */
export const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(ApiError.unauthorized("Authentication required"));
    }

    if (!roles.includes(req.user.role)) {
      return next(
        ApiError.forbidden(
          `Forbidden: Role '${req.user.role}' is not authorized to access this resource`
        )
      );
    }

    next();
  };
};

export default requireRole;
