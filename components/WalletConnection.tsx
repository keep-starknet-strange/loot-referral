'use client';

import { useEffect, useCallback, useRef } from 'react';
import { Wallet, LogOut } from 'lucide-react';
import { useReferral } from '@/hooks/useReferral';
import { 
  useConnect, 
  useDisconnect, 
  useAccount,
} from '@starknet-react/core';
import { useConnectorContext, initializeControllerConnectorAsync, getControllerConnector } from '@/providers/StarknetProvider';

interface WalletConnectionProps {
  onAddressChange: (address: string | null) => void;
}

export function WalletConnection({ onAddressChange }: WalletConnectionProps) {
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const { address, isConnected } = useAccount();
  const { submitReferral } = useReferral();
  
  // Track if we've already submitted referral for this address to prevent duplicates
  const submittedAddressRef = useRef<string | null>(null);

  // Get the Controller connector (should be the first/only connector)
  // Note: Connector may not be available until user clicks "Connect Wallet"
  const controllerConnector = connectors.find(
    (connector) => connector.id === 'controller' || connector.name?.toLowerCase().includes('controller')
  ) || connectors[0];

  // Update parent when address changes
  useEffect(() => {
    onAddressChange(address || null);
  }, [address, onAddressChange]);

  // Close Cartridge Controller modal after successful connection
  useEffect(() => {
    if (isConnected && address) {
      // The modal should close automatically, but if it doesn't, try to close it
      // Cartridge Controller modal is in an iframe, so we can't directly control it
      // But we can try to remove the modal container if it's still visible
      const closeModal = () => {
        const controllerElement = document.getElementById('controller');
        if (controllerElement) {
          // Wait a bit for the modal to close naturally
          setTimeout(() => {
            // Only remove if still visible (modal might have already closed)
            const stillOpen = document.getElementById('controller');
            if (stillOpen && stillOpen.style.display !== 'none') {
              // Try to trigger close by dispatching a message to the iframe
              const iframe = stillOpen.querySelector('iframe[id^="controller-"]') as HTMLIFrameElement | null;
              if (iframe && iframe.contentWindow) {
                try {
                  // Send close message (if Cartridge Controller supports it)
                  iframe.contentWindow.postMessage({ type: 'close' }, '*');
                } catch (e) {
                  // Cross-origin restrictions might prevent this
                  console.debug('Could not send close message to iframe');
                }
              }
            }
          }, 1000);
        }
      };
      closeModal();
    }
  }, [isConnected, address]);

  // Add Escape key handler, click-outside handler, and message listener to close modal
  useEffect(() => {
    const closeModal = () => {
      const controllerElement = document.getElementById('controller');
      if (controllerElement) {
        // Force close by hiding/removing the modal immediately
        controllerElement.style.display = 'none';
        controllerElement.style.visibility = 'hidden';
        controllerElement.style.opacity = '0';
        controllerElement.style.pointerEvents = 'none';
        
        // Remove it completely after a short delay
        setTimeout(() => {
          const stillOpen = document.getElementById('controller');
          if (stillOpen) {
            stillOpen.remove();
          }
        }, 200);
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        const controllerElement = document.getElementById('controller');
        if (controllerElement && controllerElement.style.display !== 'none') {
          e.preventDefault();
          e.stopPropagation();
          closeModal();
        }
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      const controllerElement = document.getElementById('controller');
      if (controllerElement && controllerElement.style.display !== 'none') {
        const target = e.target as HTMLElement;
        // Only close if clicking directly on the backdrop (controller element itself)
        // Clicks on the iframe or its children will be handled by the iframe
        if (target === controllerElement || target.id === 'controller') {
          e.preventDefault();
          e.stopPropagation();
          closeModal();
        }
      }
    };

    // Listen for postMessage events from the iframe (Cartridge Controller might send close events)
    const handleMessage = (e: MessageEvent) => {
      // Check if message is from Cartridge Controller iframe
      const controllerElement = document.getElementById('controller');
      if (!controllerElement) return;

      const iframe = controllerElement.querySelector('iframe[id^="controller-"]') as HTMLIFrameElement | null;
      if (!iframe) return;

      // Check if message is from the iframe (origin check)
      try {
        // Common close message types from Cartridge Controller
        if (
          e.data?.type === 'close' ||
          e.data?.type === 'cartridge:close' ||
          e.data?.action === 'close' ||
          e.data?.event === 'close' ||
          (typeof e.data === 'string' && e.data.includes('close'))
        ) {
          closeModal();
        }
      } catch (err) {
        // Ignore errors from origin checks
      }
    };

    // Use MutationObserver to watch for modal visibility changes
    const observeModal = () => {
      const controllerElement = document.getElementById('controller');
      if (!controllerElement) return null;

      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          // Check if iframe was removed (Cartridge Controller closed itself)
          if (mutation.type === 'childList' && mutation.removedNodes.length > 0) {
            const removedIframe = Array.from(mutation.removedNodes).find(
              (node) => node.nodeType === Node.ELEMENT_NODE && 
              (node as HTMLElement).tagName === 'IFRAME' &&
              (node as HTMLElement).id?.startsWith('controller-')
            );
            
            if (removedIframe) {
              // Iframe was removed, close the modal container
              setTimeout(() => {
                closeModal();
              }, 100);
              return;
            }
          }

          const target = mutation.target as HTMLElement;
          // If modal is being hidden or removed, ensure it's fully closed
          if (
            target.id === 'controller' &&
            (target.style.display === 'none' ||
             target.style.visibility === 'hidden' ||
             target.style.opacity === '0' ||
             !target.isConnected)
          ) {
            // Modal is closing, ensure it's fully removed
            setTimeout(() => {
              const stillOpen = document.getElementById('controller');
              if (stillOpen && (stillOpen.style.display === 'none' || !stillOpen.isConnected)) {
                stillOpen.remove();
              }
            }, 100);
          }

          // Check if iframe inside is being hidden
          if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
            const iframe = controllerElement.querySelector('iframe[id^="controller-"]') as HTMLIFrameElement | null;
            if (iframe && (
              iframe.style.display === 'none' ||
              iframe.style.visibility === 'hidden' ||
              iframe.style.opacity === '0'
            )) {
              // Iframe is being hidden, close the modal
              setTimeout(() => {
                closeModal();
              }, 200);
            }
          }
        });
      });

      observer.observe(controllerElement, {
        attributes: true,
        attributeFilter: ['style', 'class'],
        childList: true,
        subtree: true,
      });

      return observer;
    };

    // Set up observers
    let observer: MutationObserver | null = null;
    
    // Check for modal immediately and set up observer
    const checkAndObserve = () => {
      const controllerElement = document.getElementById('controller');
      if (controllerElement) {
        observer = observeModal();
      } else {
        // Modal not yet present, check again soon
        setTimeout(checkAndObserve, 100);
      }
    };
    
    checkAndObserve();

    // Also check periodically in case modal appears later or iframe is removed
    const intervalId = setInterval(() => {
      const controllerElement = document.getElementById('controller');
      if (controllerElement) {
        if (!observer) {
          observer = observeModal();
        }
        
        // Check if iframe was removed but container still exists (modal should be closed)
        const iframe = controllerElement.querySelector('iframe[id^="controller-"]');
        if (!iframe && controllerElement.style.display !== 'none') {
          // Iframe is gone but container is still visible - close it
          closeModal();
        }
      }
    }, 300);

    window.addEventListener('keydown', handleEscape);
    window.addEventListener('message', handleMessage);
    document.addEventListener('click', handleClickOutside, true); // Use capture phase
    
    return () => {
      window.removeEventListener('keydown', handleEscape);
      window.removeEventListener('message', handleMessage);
      document.removeEventListener('click', handleClickOutside, true);
      if (observer) {
        observer.disconnect();
      }
      clearInterval(intervalId);
    };
  }, []);

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
    }
  }, [isConnected]);

  const { setConnectors } = useConnectorContext();

  const handleConnect = useCallback(async () => {
    // Initialize connector only when user clicks the button
    // This prevents WASM from loading until explicitly requested
    let connectorToUse = controllerConnector;

    // If connector is not available, initialize it now
    if (!connectorToUse) {
      try {
        // Try synchronous first (works for Safari)
        const newConnector = getControllerConnector();
        
        // If not available, use async initialization (better for Chrome)
        const initializedConnector = newConnector || await initializeControllerConnectorAsync();

        if (!initializedConnector) {
          console.error('Failed to initialize Controller connector');
          return;
        }

        // Register the connector with StarknetConfig
        setConnectors([initializedConnector]);
        
        // Wait a moment for the connector to be registered in the context
        await new Promise(resolve => setTimeout(resolve, 100));
        
        connectorToUse = initializedConnector;
      } catch (err) {
        console.error('Error initializing connector:', err);
        return;
      }
    }

    if (!connectorToUse) {
      console.error('Controller connector not found');
      return;
    }

    try {
      await connect({ connector: connectorToUse });
    } catch (err) {
      console.error('Error connecting wallet:', err);
    }
  }, [connect, controllerConnector, setConnectors]);

  const handleDisconnect = useCallback(async () => {
    try {
      await disconnect();
    } catch (err) {
      console.error('Error disconnecting wallet:', err);
    }
  }, [disconnect]);

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
              <p className="text-xs sm:text-sm font-mono text-dungeon-text break-all sm:break-normal">{truncateAddress(address)}</p>
            </div>
          </div>
          <button
            onClick={handleDisconnect}
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
        className="w-full px-4 py-2 sm:py-3 bg-dungeon-button hover:bg-dungeon-button/90 text-black font-bold rounded-lg transition-colors flex items-center justify-center gap-2 text-sm sm:text-base shadow-lg"
      >
        <Wallet className="w-4 h-4" />
        Connect Wallet
      </button>
    </div>
  );
}
