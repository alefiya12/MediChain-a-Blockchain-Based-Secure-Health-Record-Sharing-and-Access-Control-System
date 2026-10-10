import { ethers } from "ethers";
import { env } from "./env.js";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load ABI from the exported contract JSON
const contractJson = JSON.parse(
  readFileSync(join(__dirname, "../contracts/MediChain.json"), "utf-8")
);

// Read-only provider — backend never signs transactions
const provider = new ethers.JsonRpcProvider(env.AMOY_RPC_URL);

// Read-only contract instance
const contract = new ethers.Contract(
  env.CONTRACT_ADDRESS,
  contractJson.abi,
  provider
);

export { provider, contract };
