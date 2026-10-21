/**
 * Utility formatting helpers for MediChain
 */

/**
 * Truncates an Ethereum address (e.g. 0x443E...83464)
 */
export function truncateAddress(address, start = 6, end = 4) {
  if (!address) return "";
  if (address.length <= start + end) return address;
  return `${address.slice(0, start)}...${address.slice(-end)}`;
}

/**
 * Truncates a transaction hash
 */
export function truncateTx(hash, start = 8, end = 6) {
  if (!hash) return "";
  if (hash.length <= start + end) return hash;
  return `${hash.slice(0, start)}...${hash.slice(-end)}`;
}

/**
 * Formats ISO date or timestamp to localized human-readable string
 */
export function formatDate(dateString) {
  if (!dateString) return "N/A";
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return dateString;
    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch {
    return dateString;
  }
}

/**
 * Formats file size in bytes to human-readable string (KB, MB)
 */
export function formatBytes(bytes, decimals = 2) {
  if (!bytes || bytes === 0) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

/**
 * Returns Polygonscan block explorer transaction URL for Polygon Amoy
 */
export function getTxUrl(txHash) {
  if (!txHash) return "#";
  return `https://amoy.polygonscan.com/tx/${txHash}`;
}

/**
 * Returns Polygonscan address URL for Polygon Amoy
 */
export function getAddressUrl(address) {
  if (!address) return "#";
  return `https://amoy.polygonscan.com/address/${address}`;
}
