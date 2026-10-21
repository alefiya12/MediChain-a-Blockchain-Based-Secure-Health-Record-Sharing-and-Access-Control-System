import React from "react";
import { useWallet } from "../context/WalletContext";
import { truncateAddress } from "../utils/format";

export default function WalletButton() {
  const {
    account,
    chainId,
    isAmoy,
    isConnecting,
    isMismatch,
    mismatchMessage,
    connect,
    switchToAmoy
  } = useWallet();

  if (!account) {
    return (
      <button
        onClick={connect}
        disabled={isConnecting}
        className="btn btn-wallet btn-wallet-disconnected shadow-sm"
        type="button"
        id="connect-wallet-btn"
      >
        <i className="bi bi-wallet2"></i>
        <span>{isConnecting ? "Connecting..." : "Connect Wallet"}</span>
      </button>
    );
  }

  return (
    <div className="d-flex align-items-center gap-2">
      {/* Network Indicator */}
      {!isAmoy ? (
        <button
          onClick={switchToAmoy}
          className="btn btn-sm btn-outline-warning d-flex align-items-center gap-1 py-1"
          title="Click to switch to Polygon Amoy (chainId 80002)"
        >
          <i className="bi bi-exclamation-triangle-fill"></i>
          <span className="small">Switch to Amoy</span>
        </button>
      ) : (
        <span
          className="badge bg-secondary-subtle text-secondary-emphasis border d-flex align-items-center gap-1 py-1 px-2"
          style={{ fontSize: "0.75rem" }}
        >
          <i className="bi bi-shield-check text-success"></i>
          <span>Amoy</span>
        </span>
      )}

      {/* Account Button */}
      <div
        className={`btn-wallet ${
          isMismatch ? "btn-wallet-mismatch" : "btn-wallet-connected"
        }`}
        title={isMismatch ? mismatchMessage : `Connected: ${account}`}
      >
        <span
          className={`pulse-dot ${
            isMismatch ? "pulse-dot-danger" : "pulse-dot-success"
          }`}
        ></span>
        <span className="font-monospace small">{truncateAddress(account)}</span>
        {isMismatch && (
          <span className="badge bg-danger ms-1" style={{ fontSize: "0.65rem" }}>
            MISMATCH
          </span>
        )}
      </div>
    </div>
  );
}
