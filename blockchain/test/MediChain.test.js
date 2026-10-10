const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("MediChain", function () {
  let medichain;
  let owner, patient, doctor, other;

  // Helper: create a random bytes32 recordId
  const makeRecordId = (str) => ethers.id(str);
  // Helper: create a bytes32 fileHash from a hex string
  const makeHash = (hex) => ethers.zeroPadValue(hex, 32);

  const ZERO_HASH = ethers.ZeroHash; // "0x0000...0000"
  const SAMPLE_HASH = ethers.id("sample_file_content"); // keccak256, non-zero

  beforeEach(async function () {
    [owner, patient, doctor, other] = await ethers.getSigners();
    const MediChain = await ethers.getContractFactory("MediChain");
    medichain = await MediChain.deploy();
    await medichain.waitForDeployment();
  });

  // ─────────────────────────────────────────────
  // Admin: verifyDoctor / rejectDoctor
  // ─────────────────────────────────────────────
  describe("Admin functions", function () {
    it("owner can verifyDoctor", async function () {
      await expect(medichain.connect(owner).verifyDoctor(doctor.address))
        .to.emit(medichain, "DoctorVerified")
        .withArgs(doctor.address, owner.address);

      expect(await medichain.verifiedDoctors(doctor.address)).to.equal(true);
    });

    it("non-owner cannot verifyDoctor", async function () {
      await expect(
        medichain.connect(other).verifyDoctor(doctor.address)
      ).to.be.revertedWithCustomError(medichain, "OwnableUnauthorizedAccount");
    });

    it("verifyDoctor reverts on zero address", async function () {
      await expect(
        medichain.connect(owner).verifyDoctor(ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid address");
    });

    it("owner can rejectDoctor (sets to false)", async function () {
      await medichain.connect(owner).verifyDoctor(doctor.address);
      await expect(medichain.connect(owner).rejectDoctor(doctor.address))
        .to.emit(medichain, "DoctorRejected")
        .withArgs(doctor.address, owner.address);

      expect(await medichain.verifiedDoctors(doctor.address)).to.equal(false);
    });

    it("non-owner cannot rejectDoctor", async function () {
      await expect(
        medichain.connect(other).rejectDoctor(doctor.address)
      ).to.be.revertedWithCustomError(medichain, "OwnableUnauthorizedAccount");
    });
  });

  // ─────────────────────────────────────────────
  // Records: registerRecord / getRecord / verifyRecordHash
  // ─────────────────────────────────────────────
  describe("Record registration", function () {
    const recordId = ethers.id("mongo-id-001");

    it("registerRecord stores data correctly and emits event", async function () {
      const tx = await medichain.connect(patient).registerRecord(recordId, SAMPLE_HASH);
      const receipt = await tx.wait();
      const block = await ethers.provider.getBlock(receipt.blockNumber);

      await expect(tx)
        .to.emit(medichain, "RecordRegistered")
        .withArgs(recordId, patient.address, SAMPLE_HASH, BigInt(block.timestamp));

      const [storedHash, storedPatient, storedTimestamp] = await medichain.getRecord(recordId);
      expect(storedHash).to.equal(SAMPLE_HASH);
      expect(storedPatient).to.equal(patient.address);
      expect(storedTimestamp).to.equal(BigInt(block.timestamp));
    });

    it("duplicate recordId reverts", async function () {
      await medichain.connect(patient).registerRecord(recordId, SAMPLE_HASH);
      await expect(
        medichain.connect(patient).registerRecord(recordId, SAMPLE_HASH)
      ).to.be.revertedWith("Record already registered");
    });

    it("zero fileHash reverts", async function () {
      await expect(
        medichain.connect(patient).registerRecord(recordId, ZERO_HASH)
      ).to.be.revertedWith("Empty hash");
    });

    it("getRecord reverts for non-existent recordId", async function () {
      const fakeId = ethers.id("does-not-exist");
      await expect(medichain.getRecord(fakeId)).to.be.revertedWith("Record not found");
    });
  });

  // ─────────────────────────────────────────────
  // verifyRecordHash
  // ─────────────────────────────────────────────
  describe("verifyRecordHash", function () {
    const recordId = ethers.id("mongo-id-verify");

    beforeEach(async function () {
      await medichain.connect(patient).registerRecord(recordId, SAMPLE_HASH);
    });

    it("returns true for the correct hash", async function () {
      expect(await medichain.verifyRecordHash(recordId, SAMPLE_HASH)).to.equal(true);
    });

    it("returns false for a wrong hash", async function () {
      const wrongHash = ethers.id("wrong_file_content");
      expect(await medichain.verifyRecordHash(recordId, wrongHash)).to.equal(false);
    });

    it("reverts for non-existent recordId", async function () {
      const fakeId = ethers.id("fake");
      await expect(
        medichain.verifyRecordHash(fakeId, SAMPLE_HASH)
      ).to.be.revertedWith("Record not found");
    });
  });

  // ─────────────────────────────────────────────
  // Access control: requestAccess
  // ─────────────────────────────────────────────
  describe("Access: requestAccess", function () {
    it("unverified doctor cannot requestAccess", async function () {
      await expect(
        medichain.connect(doctor).requestAccess(patient.address)
      ).to.be.revertedWith("Doctor not verified");
    });

    it("verified doctor can requestAccess and emits AccessRequested", async function () {
      await medichain.connect(owner).verifyDoctor(doctor.address);
      await expect(medichain.connect(doctor).requestAccess(patient.address))
        .to.emit(medichain, "AccessRequested");
    });

    it("cannot requestAccess with zero patient address", async function () {
      await medichain.connect(owner).verifyDoctor(doctor.address);
      await expect(
        medichain.connect(doctor).requestAccess(ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid patient");
    });

    it("cannot requestAccess with self as patient", async function () {
      await medichain.connect(owner).verifyDoctor(doctor.address);
      await expect(
        medichain.connect(doctor).requestAccess(doctor.address)
      ).to.be.revertedWith("Invalid patient");
    });

    it("cannot create duplicate pending/granted request", async function () {
      await medichain.connect(owner).verifyDoctor(doctor.address);
      await medichain.connect(doctor).requestAccess(patient.address);
      await expect(
        medichain.connect(doctor).requestAccess(patient.address)
      ).to.be.revertedWith("Request exists");
    });
  });

  // ─────────────────────────────────────────────
  // Full flow: verify → request → approve → hasAccess → revoke
  // ─────────────────────────────────────────────
  describe("Full access flow", function () {
    beforeEach(async function () {
      await medichain.connect(owner).verifyDoctor(doctor.address);
      await medichain.connect(doctor).requestAccess(patient.address);
    });

    it("hasAccess is false before patient responds", async function () {
      expect(await medichain.hasAccess(patient.address, doctor.address)).to.equal(false);
    });

    it("patient approves → hasAccess is true → emits AccessGranted", async function () {
      await expect(medichain.connect(patient).respondToRequest(doctor.address, true))
        .to.emit(medichain, "AccessGranted");

      expect(await medichain.hasAccess(patient.address, doctor.address)).to.equal(true);
    });

    it("patient revokes → hasAccess is false → emits AccessRevoked", async function () {
      await medichain.connect(patient).respondToRequest(doctor.address, true);
      await expect(medichain.connect(patient).revokeAccess(doctor.address))
        .to.emit(medichain, "AccessRevoked");

      expect(await medichain.hasAccess(patient.address, doctor.address)).to.equal(false);
    });

    it("revokeAccess reverts if not granted", async function () {
      // Still pending — not yet approved
      await expect(
        medichain.connect(patient).revokeAccess(doctor.address)
      ).to.be.revertedWith("Not granted");
    });
  });

  // ─────────────────────────────────────────────
  // Reject flow + re-request
  // ─────────────────────────────────────────────
  describe("Reject flow and re-request", function () {
    beforeEach(async function () {
      await medichain.connect(owner).verifyDoctor(doctor.address);
      await medichain.connect(doctor).requestAccess(patient.address);
    });

    it("patient rejects → hasAccess is false → emits AccessRejected", async function () {
      await expect(medichain.connect(patient).respondToRequest(doctor.address, false))
        .to.emit(medichain, "AccessRejected");

      expect(await medichain.hasAccess(patient.address, doctor.address)).to.equal(false);
      expect(await medichain.accessStatus(patient.address, doctor.address)).to.equal(3); // Rejected = 3
    });

    it("rejected doctor can re-request access", async function () {
      await medichain.connect(patient).respondToRequest(doctor.address, false);
      // Should NOT revert
      await expect(medichain.connect(doctor).requestAccess(patient.address))
        .to.emit(medichain, "AccessRequested");
    });

    it("revoked doctor can re-request access", async function () {
      await medichain.connect(patient).respondToRequest(doctor.address, true);
      await medichain.connect(patient).revokeAccess(doctor.address);
      // Should NOT revert
      await expect(medichain.connect(doctor).requestAccess(patient.address))
        .to.emit(medichain, "AccessRequested");
    });
  });

  // ─────────────────────────────────────────────
  // respondToRequest reverts with no pending request
  // ─────────────────────────────────────────────
  describe("respondToRequest edge cases", function () {
    it("reverts when no pending request exists", async function () {
      await expect(
        medichain.connect(patient).respondToRequest(doctor.address, true)
      ).to.be.revertedWith("No pending request");
    });

    it("reverts when responding to an already-granted request", async function () {
      await medichain.connect(owner).verifyDoctor(doctor.address);
      await medichain.connect(doctor).requestAccess(patient.address);
      await medichain.connect(patient).respondToRequest(doctor.address, true);
      // Attempt to respond again
      await expect(
        medichain.connect(patient).respondToRequest(doctor.address, true)
      ).to.be.revertedWith("No pending request");
    });
  });

  // ─────────────────────────────────────────────
  // hasAccess requires both verified + granted
  // ─────────────────────────────────────────────
  describe("hasAccess composite check", function () {
    it("returns false if doctor verified but access not granted", async function () {
      await medichain.connect(owner).verifyDoctor(doctor.address);
      expect(await medichain.hasAccess(patient.address, doctor.address)).to.equal(false);
    });

    it("returns false if access granted but doctor later rejected (unverified)", async function () {
      await medichain.connect(owner).verifyDoctor(doctor.address);
      await medichain.connect(doctor).requestAccess(patient.address);
      await medichain.connect(patient).respondToRequest(doctor.address, true);

      // Admin rejects (unverifies) the doctor
      await medichain.connect(owner).rejectDoctor(doctor.address);

      // hasAccess should be false because verifiedDoctors[doctor] is now false
      expect(await medichain.hasAccess(patient.address, doctor.address)).to.equal(false);
    });
  });
});

// Helper: get the timestamp that the next mined block will have.
// We use this only as a loose reference for event args where exact timestamp checking is unreliable.
// Tests that need exact args use a "withArgs that ignores timestamp" pattern instead.
async function getNextTimestamp() {
  const latest = await ethers.provider.getBlock("latest");
  return BigInt(latest.timestamp + 1);
}
