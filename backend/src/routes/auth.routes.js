import { Router } from "express";
import { body } from "express-validator";
import { ethers } from "ethers";
import { register, login, getMe, updateWallet } from "../controllers/auth.controller.js";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";

const router = Router();

// Validation for registration
const registerValidation = [
  body("name")
    .trim()
    .notEmpty()
    .withMessage("Name is required"),
  body("email")
    .trim()
    .isEmail()
    .withMessage("A valid email address is required"),
  body("password")
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters long")
    .matches(/^(?=.*[a-zA-Z])(?=.*[0-9])/)
    .withMessage("Password must contain at least one letter and one number"),
  body("role")
    .isIn(["patient", "doctor"])
    .withMessage("Role must be either 'patient' or 'doctor'"),
  body("walletAddress")
    .optional({ checkFalsy: true })
    .custom((val) => {
      if (!ethers.isAddress(val)) {
        throw new Error("Invalid Ethereum/Polygon wallet address");
      }
      return true;
    }),
  // Doctor-specific fields
  body("licenseNumber")
    .if(body("role").equals("doctor"))
    .trim()
    .notEmpty()
    .withMessage("License number is required for doctors"),
  body("specialization")
    .if(body("role").equals("doctor"))
    .trim()
    .notEmpty()
    .withMessage("Specialization is required for doctors"),
  body("hospital")
    .if(body("role").equals("doctor"))
    .trim()
    .notEmpty()
    .withMessage("Hospital name is required for doctors"),
  body("experienceYears")
    .if(body("role").equals("doctor"))
    .optional({ checkFalsy: true })
    .isNumeric()
    .withMessage("Experience in years must be a number")
];

// Validation for login
const loginValidation = [
  body("email")
    .trim()
    .isEmail()
    .withMessage("A valid email address is required"),
  body("password")
    .notEmpty()
    .withMessage("Password is required")
];

// Validation for wallet update
const walletValidation = [
  body("walletAddress")
    .notEmpty()
    .withMessage("Wallet address is required")
    .custom((val) => {
      if (!ethers.isAddress(val)) {
        throw new Error("Invalid Ethereum/Polygon wallet address");
      }
      return true;
    })
];

router.post("/register", validate(registerValidation), register);
router.post("/login", validate(loginValidation), login);
router.get("/me", authenticate, getMe);
router.put("/wallet", authenticate, validate(walletValidation), updateWallet);

export default router;
