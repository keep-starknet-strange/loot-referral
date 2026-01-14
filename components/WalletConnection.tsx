'use client';

import { useEffect, useCallback, useRef, useState } from 'react';
import { Wallet, LogOut, ExternalLink } from 'lucide-react';
import { useReferral } from '@/hooks/useReferral';
import { 
  useConnect, 
  useDisconnect, 
  useAccount,
} from '@starknet-react/core';
import {
  useConnectorContext,
  initializeControllerConnectorAsync,
  getControllerConnector,
  resetControllerConnector,
  disconnectControllerSession,
} from '@/providers/StarknetProvider';

interface WalletConnectionProps {
  onAddressChange: (address: string | null) => void;
}

export function WalletConnection({ onAddressChange }: WalletConnectionProps) {
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const { address, isConnected } = useAccount();
  const { submitReferral } = useReferral();
  const { setConnectors } = useConnectorContext();
  
  // Track if we've already submitted referral for this address to prevent duplicates
  const submittedAddressRef = useRef<string | null>(null);
  
  // Store username for connected wallet
  const [username, setUsername] = useState<string | null>(null);
  
  // Track connection loading state
  const [isConnecting, setIsConnecting] = useState(false);
  const connectAttemptRef = useRef(0);
  
  // Track username loading state
  const [isLoadingUsername, setIsLoadingUsername] = useState(false);

  // Get the Controller connector (should be the first/only connector)
  // Note: Connector may not be available until user clicks "Connect Wallet"
  const controllerConnector = connectors.find(
    (connector) => connector.id === 'controller' || connector.name?.toLowerCase().includes('controller')
  ) || connectors[0];

  // Update parent when address changes
  useEffect(() => {
    onAddressChange(address || null);
  }, [address, onAddressChange]);

  // Clear connecting state on successful connect
  useEffect(() => {
    if (isConnected && address) {
      setIsConnecting(false);
    }
  }, [isConnected, address]);

  // Submit referral when connected - with delay to avoid WASM bridge race condition
  // The WASM module needs time to finalize the connection before we trigger state updates
  useEffect(() => {
    let mounted = true;
    let timeoutId: NodeJS.Timeout | null = null;

    const handleSubmission = async () => {
      // Check if we actually have work to do and haven't already submitted for this address
      if (isConnected && address && mounted && submittedAddressRef.current !== address) {
        // Add a small delay to ensure WASM bridge has finished its handshake
        // This prevents interrupting the Controller's internal state synchronization
        timeoutId = setTimeout(async () => {
          if (mounted && isConnected && address && submittedAddressRef.current !== address) {
            submittedAddressRef.current = address; // Mark as submitted before the async call
            try {
              await submitReferral(address);
            } catch (e) {
              console.error('Referral submission failed', e);
              // Reset on error so we can retry
              submittedAddressRef.current = null;
            }
          }
        }, typeof navigator !== 'undefined' && /Chrome/.test(navigator.userAgent) ? 1000 : 500); // Longer delay for Chrome (1000ms) vs Safari (500ms)
      }
    };

    handleSubmission();
    
    return () => {
      mounted = false;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [isConnected, address, submitReferral]);
  
  // Reset submitted address when disconnected
  useEffect(() => {
    if (!isConnected) {
      submittedAddressRef.current = null;
      setUsername(null); // Also reset username
      setIsLoadingUsername(false); // Reset loading state
    }
  }, [isConnected]);

  // Fetch username when address changes
  useEffect(() => {
    let mounted = true;

    const fetchUsername = async () => {
      if (!address) {
        setUsername(null);
        setIsLoadingUsername(false);
        return;
      }

      setIsLoadingUsername(true);
      try {
        const response = await fetch(`/api/username?address=${address}`);
        if (!response.ok) {
          console.warn('Failed to fetch username');
          setIsLoadingUsername(false);
          return;
        }

        const data = await response.json();
        if (mounted) {
          if (data.username) {
            setUsername(data.username);
          }
          setIsLoadingUsername(false);
        }
      } catch (error) {
        console.error('Error fetching username:', error);
        if (mounted) {
          setIsLoadingUsername(false);
        }
      }
    };

    fetchUsername();

    return () => {
      mounted = false;
    };
  }, [address]);

  const resetFailedConnectAttempt = useCallback(async () => {
    try {
      await disconnect();
    } catch {
      // ignore disconnect errors if we were never connected
    }
    resetControllerConnector();
    setConnectors([]);
  }, [disconnect, setConnectors]);

  // If the user closes the Controller modal without completing the flow, `connect()`
  // can remain pending and the connector can get stuck. Detect cancellation and reset.
  useEffect(() => {
    if (!isConnecting) return;
    if (isConnected) return;

    let cancelled = false;
    let sawModal = false;
    const startedAt = Date.now();
    const poll = setInterval(() => {
      if (cancelled) return;
      if (isConnected) return;

      const controllerElement = document.getElementById('controller');
      const iframe = controllerElement?.querySelector('iframe[id^="controller-"]');

      const hasModalOpen =
        !!controllerElement &&
        controllerElement.style.display !== 'none' &&
        controllerElement.style.visibility !== 'hidden' &&
        controllerElement.style.opacity !== '0' &&
        !!iframe;

      const timedOut = Date.now() - startedAt > 60_000;

      if (hasModalOpen) {
        sawModal = true;
        return;
      }

      // If the modal is gone and we're still not connected, treat it as a cancellation.
      if ((sawModal && !isConnected) || timedOut) {
        cancelled = true;
        setIsConnecting(false);
        resetFailedConnectAttempt();
        clearInterval(poll);
      }
    }, 350);

    return () => {
      cancelled = true;
      clearInterval(poll);
    };
  }, [isConnecting, isConnected, resetFailedConnectAttempt]);

  const handleConnect = useCallback(async () => {
    const attemptId = ++connectAttemptRef.current;
    setIsConnecting(true);

    // If a previous attempt left a hidden/stale controller container in the DOM,
    // Cartridge may reuse it and the modal won't show. Remove it before connecting.
    const existingController = document.getElementById('controller');
    if (existingController && !isConnected) {
      const isHidden =
        existingController.style.display === 'none' ||
        existingController.style.visibility === 'hidden' ||
        existingController.style.opacity === '0' ||
        existingController.style.pointerEvents === 'none';
      const hasIframe = !!existingController.querySelector('iframe[id^="controller-"]');
      if (isHidden || !hasIframe) {
        existingController.remove();
      }
    }

    // Initialize connector only when user clicks the button
    // This prevents WASM from loading until explicitly requested
    let connectorToUse = controllerConnector;

    if (!connectorToUse) {
      try {
        // Try synchronous first (works for Safari)
        const newConnector = getControllerConnector();
        const initializedConnector = newConnector || (await initializeControllerConnectorAsync());

        if (!initializedConnector) {
          console.error('Failed to initialize Controller connector');
          if (connectAttemptRef.current === attemptId) setIsConnecting(false);
          return;
        }

        setConnectors([initializedConnector]);
        await new Promise((resolve) => setTimeout(resolve, 100));
        connectorToUse = initializedConnector;
      } catch (err) {
        console.error('Error initializing connector:', err);
        if (connectAttemptRef.current === attemptId) setIsConnecting(false);
        return;
      }
    }

    if (!connectorToUse) {
      console.error('Controller connector not found');
      if (connectAttemptRef.current === attemptId) setIsConnecting(false);
      return;
    }

    const shouldRetryConnect = (err: unknown) => {
      const message = err instanceof Error ? err.message : String(err ?? '');
      return (
        message.toLowerCase().includes('destroyed connection') ||
        message.toLowerCase().includes('account not initialized')
      );
    };

    try {
      await connect({ connector: connectorToUse });
    } catch (err) {
      console.error('Error connecting wallet:', err);
      const retry = shouldRetryConnect(err);
      await resetFailedConnectAttempt();

      // One automatic retry: avoids "first click fails, second click works"
      if (retry) {
        try {
          const fresh = getControllerConnector() || (await initializeControllerConnectorAsync());
          if (fresh) {
            setConnectors([fresh]);
            await new Promise((resolve) => setTimeout(resolve, 100));
            await connect({ connector: fresh });
          }
        } catch (retryErr) {
          console.error('Retry connect failed:', retryErr);
        }
      }
    } finally {
      if (connectAttemptRef.current === attemptId) {
        setIsConnecting(false);
      }
    }
  }, [connect, controllerConnector, initializeControllerConnectorAsync, isConnected, resetFailedConnectAttempt, setConnectors]);

  const handleDisconnect = useCallback(async () => {
    let disconnectError: unknown = null;
    try {
      await disconnect();
    } catch (err: any) {
      disconnectError = err;
      const message = err instanceof Error ? err.message : String(err);
      if (!message.toLowerCase().includes('destroyed connection')) {
        console.error('Error disconnecting wallet:', err);
      }
    } finally {
      await disconnectControllerSession();
      resetControllerConnector();
      setConnectors([]);
      const existingController = document.getElementById('controller');
      if (existingController) {
        existingController.remove();
      }

      setUsername(null);
      setIsLoadingUsername(false);
      submittedAddressRef.current = null;

      void disconnectError;
    }
  }, [disconnect, setConnectors]);

  const voyagerUrl = (addr: string) => `https://voyager.online/contract/${addr}`;

  const truncateAddress = (addr: string) => {
    if (!addr) return '';
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  if (isConnected && address) {
    return (
      <div className="bg-dungeon-green rounded-lg border border-dungeon-border p-3 sm:p-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-2 h-2 bg-dungeon-green-glow rounded-full flex-shrink-0 animate-pulse"></div>
            <div>
              <p className="text-xs text-dungeon-text">Connected</p>
              {isLoadingUsername ? (
                <>
                  <p className="text-sm text-dungeon-text flex items-center">
                    <span>Username: </span>
                    <span className="inline-flex ml-0.5">
                      <span className="animate-bounce" style={{ animationDelay: '0ms' }}>.</span>
                      <span className="animate-bounce" style={{ animationDelay: '150ms' }}>.</span>
                      <span className="animate-bounce" style={{ animationDelay: '300ms' }}>.</span>
                    </span>
                  </p>
                  <div className="text-sm text-dungeon-text flex items-center gap-2">
                    <span>Address: {truncateAddress(address)}</span>
                    <a
                      href={voyagerUrl(address)}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="Open address on Voyager"
                      title="Open on Voyager"
                      className="inline-flex items-center gap-1.5 px-2 py-1 rounded border border-dungeon-border bg-dungeon-dark/40 hover:bg-dungeon-dark/70 transition-colors whitespace-nowrap"
                    >
                      <ExternalLink className="w-3.5 h-3.5 text-dungeon-text" />
                      <span className="text-xs text-dungeon-text">See on Voyager</span>
                    </a>
                  </div>
                </>
              ) : username ? (
                <>
                  <p className="text-sm text-dungeon-text">
                    Username: {username}
                  </p>
                  <div className="text-sm text-dungeon-text flex items-center gap-2">
                    <span>Address: {truncateAddress(address)}</span>
                    <a
                      href={voyagerUrl(address)}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="Open address on Voyager"
                      title="Open on Voyager"
                      className="inline-flex items-center gap-1.5 px-2 py-1 rounded border border-dungeon-border bg-dungeon-dark/40 hover:bg-dungeon-dark/70 transition-colors whitespace-nowrap"
                    >
                      <ExternalLink className="w-3.5 h-3.5 text-dungeon-text" />
                      <span className="text-xs text-dungeon-text">See on Voyager</span>
                    </a>
                  </div>
                </>
              ) : (
                <div className="text-sm text-dungeon-text flex items-center gap-2">
                  <span>Address: {truncateAddress(address)}</span>
                  <a
                    href={voyagerUrl(address)}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Open address on Voyager"
                    title="Open on Voyager"
                    className="inline-flex items-center gap-1.5 px-2 py-1 rounded border border-dungeon-border bg-dungeon-dark/40 hover:bg-dungeon-dark/70 transition-colors whitespace-nowrap"
                  >
                    <ExternalLink className="w-3.5 h-3.5 text-dungeon-text" />
                    <span className="text-xs text-dungeon-text">See on Voyager</span>
                  </a>
                </div>
              )}
            </div>
          </div>
          <button
            onClick={(e) => {
              e.preventDefault();
              handleDisconnect().catch((err) => {
                console.debug('Disconnect error caught:', err);
              });
            }}
            className="w-full sm:w-auto px-3 py-1.5 bg-dungeon-green-light hover:bg-dungeon-green-light/80 text-white rounded-lg transition-colors flex items-center justify-center gap-2 text-sm"
          >
            <LogOut className="w-4 h-4" />
            Disconnect
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-dungeon-green rounded-lg border border-dungeon-border p-3 sm:p-4">
      <button
        onClick={handleConnect}
        disabled={isConnecting}
        className="w-full px-4 py-2 sm:py-3 bg-dungeon-button hover:bg-dungeon-button/90 disabled:opacity-70 disabled:cursor-not-allowed text-black font-bold rounded-lg transition-colors flex items-center justify-center gap-2 text-sm sm:text-base shadow-lg"
      >
        <Wallet className="w-4 h-4" />
        {isConnecting ? 'Connecting...' : 'Connect Wallet'}
      </button>
    </div>
  );
}
