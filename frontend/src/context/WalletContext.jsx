import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import { switchToAmoy, AMOY_CHAIN_ID_DECIMAL, AMOY_CHAIN_ID_HEX } from "../blockchain/network";
import { useAuth } from "./AuthContext";
import { toast } from "react-toastify";

const WalletContext = createContext(null);

export function WalletProvider({ children }) {
  const { user } = useAuth();

  const [account, setAccount] = useState(null);
  const [signer, setSigner] = useState(null);
  const [provider, setProvider] = useState(null);
  const [chainId, setChainId] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState(null);

  const isAmoy = chainId === AMOY_CHAIN_ID_DECIMAL;

  // Address mismatch check: connected account vs user registered wallet
  const isMismatch = Boolean(
    account &&
    user?.walletAddress &&
    account.toLowerCase() !== user.walletAddress.toLowerCase()
  );

  const mismatchMessage = isMismatch
    ? `Wallet mismatch: Connected (${account.slice(0, 6)}...${account.slice(-4)}) does not match your registered account (${user.walletAddress.slice(0, 6)}...${user.walletAddress.slice(-4)}). Please switch accounts in MetaMask.`
    : null;

  // Initialize or update signer and provider
  const updateSigner = useCallback(async (browserProvider, selectedAccount) => {
    try {
      const ethSigner = await browserProvider.getSigner(selectedAccount);
      setSigner(ethSigner);
    } catch {
      setSigner(null);
    }
  }, []);

  // Connect to MetaMask
  const connect = useCallback(async () => {
    if (!window.ethereum) {
      const msg = "MetaMask is not installed. Please install the MetaMask extension.";
      setError(msg);
      toast.warning(msg);
      return null;
    }

    setIsConnecting(true);
    setError(null);

    try {
      const browserProvider = new ethers.BrowserProvider(window.ethereum);
      setProvider(browserProvider);

      // Request accounts
      const accounts = await browserProvider.send("eth_requestAccounts", []);
      if (!accounts || accounts.length === 0) {
        throw new Error("No accounts found or connection was rejected.");
      }

      const activeAccount = accounts[0];
      setAccount(activeAccount);

      // Check network
      const network = await browserProvider.getNetwork();
      const currentChainId = Number(network.chainId);
      setChainId(currentChainId);

      await updateSigner(browserProvider, activeAccount);

      // Prompt to switch to Polygon Amoy if on different chain
      if (currentChainId !== AMOY_CHAIN_ID_DECIMAL) {
        toast.info("Switching network to Polygon Amoy testnet...");
        try {
          await switchToAmoy();
          const updatedNetwork = await browserProvider.getNetwork();
          setChainId(Number(updatedNetwork.chainId));
        } catch (switchErr) {
          toast.warning("Please switch your MetaMask network to Polygon Amoy (chainId 80002).");
        }
      }

      return activeAccount;
    } catch (err) {
      const msg = err.message || "Failed to connect wallet.";
      setError(msg);
      if (err.code !== 4001) {
        toast.error(msg);
      }
      return null;
    } finally {
      setIsConnecting(false);
    }
  }, [updateSigner]);

  // Check if wallet is already connected on mount
  useEffect(() => {
    if (!window.ethereum) return;

    const browserProvider = new ethers.BrowserProvider(window.ethereum);
    setProvider(browserProvider);

    browserProvider
      .send("eth_accounts", [])
      .then(async (accounts) => {
        if (accounts && accounts.length > 0) {
          const activeAccount = accounts[0];
          setAccount(activeAccount);
          const network = await browserProvider.getNetwork();
          setChainId(Number(network.chainId));
          await updateSigner(browserProvider, activeAccount);
        }
      })
      .catch(() => {});
  }, [updateSigner]);

  // Listen to accountsChanged and chainChanged events
  useEffect(() => {
    if (!window.ethereum) return;

    const handleAccountsChanged = async (accounts) => {
      if (accounts.length === 0) {
        setAccount(null);
        setSigner(null);
      } else {
        const newAccount = accounts[0];
        setAccount(newAccount);
        if (provider) {
          await updateSigner(provider, newAccount);
        }
      }
    };

    const handleChainChanged = (chainHex) => {
      const newChainId = parseInt(chainHex, 16);
      setChainId(newChainId);
    };

    window.ethereum.on("accountsChanged", handleAccountsChanged);
    window.ethereum.on("chainChanged", handleChainChanged);

    return () => {
      if (window.ethereum.removeListener) {
        window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
        window.ethereum.removeListener("chainChanged", handleChainChanged);
      }
    };
  }, [provider, updateSigner]);

  // Notify user if wallet mismatch occurs
  useEffect(() => {
    if (isMismatch && mismatchMessage) {
      toast.warn(mismatchMessage, { toastId: "wallet_mismatch_toast", autoClose: 6000 });
    }
  }, [isMismatch, mismatchMessage]);

  const disconnect = () => {
    setAccount(null);
    setSigner(null);
  };

  const value = {
    account,
    signer,
    provider,
    chainId,
    isAmoy,
    isConnecting,
    isMismatch,
    mismatchMessage,
    error,
    connect,
    disconnect,
    switchToAmoy
  };

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error("useWallet must be used within a WalletProvider");
  }
  return context;
}
