// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

contract MediChain is Ownable {
    enum AccessStatus { None, Pending, Granted, Rejected, Revoked }

    struct Record {
        bytes32 fileHash;
        address patient;
        uint64  timestamp;
        bool    exists;
    }

    mapping(bytes32 => Record) private records;                              // recordId => Record
    mapping(address => bool) public verifiedDoctors;
    mapping(address => mapping(address => AccessStatus)) public accessStatus; // patient => doctor => status

    event DoctorVerified(address indexed doctor, address indexed admin);
    event DoctorRejected(address indexed doctor, address indexed admin);
    event RecordRegistered(bytes32 indexed recordId, address indexed patient, bytes32 fileHash, uint64 timestamp);
    event AccessRequested(address indexed patient, address indexed doctor, uint64 timestamp);
    event AccessGranted(address indexed patient, address indexed doctor, uint64 timestamp);
    event AccessRejected(address indexed patient, address indexed doctor, uint64 timestamp);
    event AccessRevoked(address indexed patient, address indexed doctor, uint64 timestamp);

    constructor() Ownable(msg.sender) {}

    // ---- Admin ----
    function verifyDoctor(address doctor) external onlyOwner {
        require(doctor != address(0), "Invalid address");
        verifiedDoctors[doctor] = true;
        emit DoctorVerified(doctor, msg.sender);
    }

    function rejectDoctor(address doctor) external onlyOwner {
        verifiedDoctors[doctor] = false;
        emit DoctorRejected(doctor, msg.sender);
    }

    // ---- Patient: records ----
    function registerRecord(bytes32 recordId, bytes32 fileHash) external {
        require(!records[recordId].exists, "Record already registered");
        require(fileHash != bytes32(0), "Empty hash");
        records[recordId] = Record(fileHash, msg.sender, uint64(block.timestamp), true);
        emit RecordRegistered(recordId, msg.sender, fileHash, uint64(block.timestamp));
    }

    function getRecord(bytes32 recordId)
        external view returns (bytes32 fileHash, address patient, uint64 timestamp)
    {
        Record memory r = records[recordId];
        require(r.exists, "Record not found");
        return (r.fileHash, r.patient, r.timestamp);
    }

    function verifyRecordHash(bytes32 recordId, bytes32 candidateHash) external view returns (bool) {
        Record memory r = records[recordId];
        require(r.exists, "Record not found");
        return r.fileHash == candidateHash;
    }

    // ---- Doctor ----
    function requestAccess(address patient) external {
        require(verifiedDoctors[msg.sender], "Doctor not verified");
        require(patient != address(0) && patient != msg.sender, "Invalid patient");
        AccessStatus s = accessStatus[patient][msg.sender];
        require(s != AccessStatus.Pending && s != AccessStatus.Granted, "Request exists");
        accessStatus[patient][msg.sender] = AccessStatus.Pending;
        emit AccessRequested(patient, msg.sender, uint64(block.timestamp));
    }

    // ---- Patient: consent ----
    function respondToRequest(address doctor, bool approve) external {
        require(accessStatus[msg.sender][doctor] == AccessStatus.Pending, "No pending request");
        if (approve) {
            accessStatus[msg.sender][doctor] = AccessStatus.Granted;
            emit AccessGranted(msg.sender, doctor, uint64(block.timestamp));
        } else {
            accessStatus[msg.sender][doctor] = AccessStatus.Rejected;
            emit AccessRejected(msg.sender, doctor, uint64(block.timestamp));
        }
    }

    function revokeAccess(address doctor) external {
        require(accessStatus[msg.sender][doctor] == AccessStatus.Granted, "Not granted");
        accessStatus[msg.sender][doctor] = AccessStatus.Revoked;
        emit AccessRevoked(msg.sender, doctor, uint64(block.timestamp));
    }

    function hasAccess(address patient, address doctor) external view returns (bool) {
        return verifiedDoctors[doctor] && accessStatus[patient][doctor] == AccessStatus.Granted;
    }
}
