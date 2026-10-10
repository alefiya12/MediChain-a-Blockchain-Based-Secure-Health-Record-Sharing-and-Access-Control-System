const fs = require("fs");
const path = require("path");

async function main() {
  // Source: Hardhat artifact
  const artifactPath = path.join(
    __dirname,
    "..",
    "artifacts",
    "contracts",
    "MediChain.sol",
    "MediChain.json"
  );

  if (!fs.existsSync(artifactPath)) {
    throw new Error(
      `Artifact not found at ${artifactPath}.\nRun 'npx hardhat compile' first.`
    );
  }

  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));

  // Source: deployment record
  // Try amoy first, fall back to hardhat (for local testing)
  let deployment = { address: "0x0000000000000000000000000000000000000000" };
  for (const net of ["amoy", "hardhat", "localhost"]) {
    const p = path.join(__dirname, "..", "deployments", `${net}.json`);
    if (fs.existsSync(p)) {
      deployment = JSON.parse(fs.readFileSync(p, "utf8"));
      console.log(`Using deployment from: ${p}`);
      break;
    }
  }

  const output = {
    address: deployment.address,
    abi: artifact.abi,
  };

  const targets = [
    path.join(__dirname, "..", "..", "backend", "src", "contracts", "MediChain.json"),
    path.join(__dirname, "..", "..", "frontend", "src", "blockchain", "MediChain.json"),
  ];

  for (const target of targets) {
    const dir = path.dirname(target);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(target, JSON.stringify(output, null, 2));
    console.log("✅ Exported ABI to:", target);
  }

  console.log("\nContract address:", output.address);
  console.log("ABI functions   :", output.abi.filter((x) => x.type === "function").length);
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
