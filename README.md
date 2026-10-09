# MediChain — Blockchain-Based Secure Health Record Sharing and Access Control System

> **Capstone Project** | Stack: React 18 + Vite + Bootstrap · Node.js 20 + Express + MongoDB · Solidity 0.8.24 + Hardhat + ethers.js v6 · Polygon Amoy Testnet

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND (Vite + React 18)               │
│  Patient / Doctor / Admin dashboards · MetaMask (ethers v6)     │
└───────────────────┬─────────────────────────────────────────────┘
                    │ REST API (JWT)
┌───────────────────▼─────────────────────────────────────────────┐
│                        BACKEND (Express + MongoDB)               │
│  Auth · Records (AES-256-GCM encrypted) · Access · Audit        │
│  Read-only on-chain verification via JsonRpcProvider             │
└───────────────────┬──────────────────────┬──────────────────────┘
                    │ Mongoose              │ ethers.js (read-only)
         ┌──────────▼──────┐    ┌──────────▼──────────────────────┐
         │    MongoDB       │    │   MediChain.sol (Polygon Amoy)   │
         │  Users, Records  │    │  File hashes · Doctor verify     │
         │  Access, Audit   │    │  Access permissions (on-chain)   │
         └──────────────────┘    └─────────────────────────────────┘
```

**Key security properties:**
- Medical files: AES-256-GCM encrypted on backend disk (`backend/storage/`). **Never on-chain, never plaintext.**
- File SHA-256 hash anchored on-chain by patient's MetaMask wallet.
- Backend never holds user private keys. All transactions are signed by the user in MetaMask.
- Doctor access requires: `isVerified === true` (MongoDB) **AND** `hasAccess(patient, doctor) === true` (on-chain).

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | 20 LTS |
| npm | 10+ |
| MongoDB Community | 7.x (or Atlas URI) |
| Git | any recent |
| MetaMask | browser extension |

## Step-by-Step Setup

### 1. Clone the repository

```bash
git clone https://github.com/alefiya12/MediChain-a-Blockchain-Based-Secure-Health-Record-Sharing-and-Access-Control-System.git
cd medichain
```

### 2. Configure environment variables

```bash
# Blockchain
cp blockchain/.env.example blockchain/.env
# Fill in: DEPLOYER_PRIVATE_KEY (test wallet only!)

# Backend
cp backend/.env.example backend/.env
# Generate JWT_SECRET:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Generate FILE_ENCRYPTION_KEY (must be 64 hex chars):
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Fill in: MONGO_URI, JWT_SECRET, FILE_ENCRYPTION_KEY, ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_WALLET

# Frontend
cp frontend/.env.example frontend/.env
# Fill in: VITE_CONTRACT_ADDRESS (after deploy)
```

### 3. Install dependencies

```bash
cd blockchain && npm install
cd ../backend && npm install
cd ../frontend && npm install
```

### 4. Deploy the smart contract

```bash
cd blockchain
npx hardhat test              # all tests must pass
npx hardhat run scripts/deploy.js --network amoy
npm run export-abi            # copies ABI to backend and frontend
```

Update `.env` files with the deployed contract address.

### 5. Seed the admin user

```bash
cd ../backend
npm run seed:admin
```

### 6. Run the application

```bash
# Terminal 1 — Backend
cd backend && npm run dev     # http://localhost:5000

# Terminal 2 — Frontend
cd frontend && npm run dev    # http://localhost:5173
```

## Environment Variables

### `blockchain/.env`

| Variable | Description |
|----------|-------------|
| `AMOY_RPC_URL` | Polygon Amoy RPC (default: `https://rpc-amoy.polygon.technology`) |
| `DEPLOYER_PRIVATE_KEY` | **Test wallet only.** Admin/deployer MetaMask private key |
| `POLYGONSCAN_API_KEY` | Optional — for contract verification on Polygonscan |

### `backend/.env`

| Variable | Description |
|----------|-------------|
| `PORT` | Default `5000` |
| `MONGO_URI` | MongoDB connection string |
| `JWT_SECRET` | Random 32-byte hex string |
| `JWT_EXPIRES_IN` | Default `7d` |
| `AMOY_RPC_URL` | Polygon Amoy RPC |
| `CONTRACT_ADDRESS` | Deployed MediChain contract address |
| `FILE_ENCRYPTION_KEY` | 64 hex chars (32 bytes) — AES-256 key |
| `FRONTEND_URL` | Default `http://localhost:5173` (CORS) |
| `ADMIN_EMAIL` | Admin account email |
| `ADMIN_PASSWORD` | Admin account password |
| `ADMIN_WALLET` | Admin MetaMask wallet address (= deployer) |

### `frontend/.env`

| Variable | Description |
|----------|-------------|
| `VITE_API_URL` | Backend API base URL |
| `VITE_CONTRACT_ADDRESS` | Deployed MediChain contract address |
| `VITE_CHAIN_ID` | `80002` (Polygon Amoy) |

## MetaMask Setup

1. Add Polygon Amoy network:
   - Network Name: `Polygon Amoy`
   - RPC URL: `https://rpc-amoy.polygon.technology`
   - Chain ID: `80002`
   - Currency symbol: `POL`
   - Block explorer: `https://amoy.polygonscan.com`
2. Create **three** accounts: Admin, Patient, Doctor.
3. Get test POL from: `https://faucet.polygon.technology`

## User Guide

### Patient
1. Register with role **Patient** — you'll get a `patientId` (format: `MC-P-XXXXXX`).
2. Link your MetaMask wallet.
3. Upload medical records (PDF/JPG/PNG ≤ 10 MB) — sign the on-chain `registerRecord` transaction.
4. Review access requests from doctors and grant/reject via MetaMask.
5. Revoke access at any time.

### Doctor
1. Register with role **Doctor** — account starts as `pending`.
2. Wait for admin approval (on-chain transaction required).
3. Search for patients by `MC-P-XXXXXX`.
4. Request access via MetaMask — patient must approve.
5. View and download authorized patient records; verify integrity.

### Admin
1. Log in with the seeded admin credentials.
2. Review pending doctors in the Verification panel.
3. Approve (signs `verifyDoctor` on-chain via MetaMask) or reject.

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Faucet rate limit | Send POL from another funded account |
| Wrong network | MetaMask prompt will appear; click "Switch to Amoy" |
| Wallet mismatch | Connect the same MetaMask account you registered with |
| Nonce issues | Reset MetaMask account (Settings → Advanced → Reset account) |
| RPC rate limit | Wait a minute and retry; or use a different Amoy RPC endpoint |
| `MODULE_NOT_FOUND` | Run `npm install` in the affected package directory |

## License

MIT — for educational/capstone purposes only.
