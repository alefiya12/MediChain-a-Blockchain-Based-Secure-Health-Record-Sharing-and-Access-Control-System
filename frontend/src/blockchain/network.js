/**
 * Polygon Amoy Testnet Network Configuration & Helpers
 */

export const AMOY_CHAIN_ID_DECIMAL = 80002;
export const AMOY_CHAIN_ID_HEX = "0x13882";

export const AMOY_NETWORK_PARAMS = {
  chainId: AMOY_CHAIN_ID_HEX,
  chainName: "Polygon Amoy Testnet",
  nativeCurrency: {
    name: "POL",
    symbol: "POL",
    decimals: 18
  },
  rpcUrls: [
    "https://polygon-amoy-bor-rpc.publicnode.com",
    "https://polygon-amoy.drpc.org",
    "https://rpc-amoy.polygon.technology"
  ],
  blockExplorerUrls: ["https://amoy.polygonscan.com"]
};

/**
 * Prompts MetaMask to switch to the Polygon Amoy testnet.
 * If the network is not yet added, it requests to add it.
 */
export async function switchToAmoy() {
  if (!window.ethereum) {
    throw new Error("MetaMask is not installed. Please install MetaMask to use blockchain features.");
  }

  try {
    // Attempt to switch to Amoy
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: AMOY_CHAIN_ID_HEX }]
    });
    return true;
  } catch (switchError) {
    // Error code 4902 indicates that the chain has not been added to MetaMask
    if (switchError.code === 4902 || switchError?.data?.originalError?.code === 4902) {
      try {
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [AMOY_NETWORK_PARAMS]
        });
        return true;
      } catch (addError) {
        throw new Error(`Failed to add Polygon Amoy to MetaMask: ${addError.message}`);
      }
    }
    throw switchError;
  }
}
