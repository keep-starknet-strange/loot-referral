'use client';

import { ReactNode, useState, createContext, useContext } from 'react';
import { constants } from 'starknet';
import { mainnet } from '@starknet-react/chains';
import {
  StarknetConfig,
  jsonRpcProvider,
  starkscan,
} from '@starknet-react/core';
import ControllerConnector from '@cartridge/connector/controller';

// RPC configuration
// Cartridge Controller requires Cartridge RPC URLs for mainnet/sepolia to parse chainId
// We use Cartridge RPC for connector initialization, but Alchemy for actual RPC calls
const CARTridge_MAINNET_RPC = 'https://api.cartridge.gg/x/starknet/mainnet/rpc/v0_9';
// Client-side RPC URL - must use NEXT_PUBLIC_ prefix but should not have hardcoded API keys
// If not set, will fail at runtime (better than exposing hardcoded keys)
const ALCHEMY_MAINNET_RPC = process.env.NEXT_PUBLIC_STARKNET_RPC;

// Configure RPC provider to use Alchemy for actual RPC calls
// Use a fallback that will error if not configured (no hardcoded keys)
const provider = jsonRpcProvider({
  rpc: () => {
    if (!ALCHEMY_MAINNET_RPC) {
      throw new Error(
        'Missing NEXT_PUBLIC_STARKNET_RPC environment variable. ' +
        'Please configure it in your .env.local file.'
      );
    }
    return { nodeUrl: ALCHEMY_MAINNET_RPC };
  },
});

// Lazy initialization of ControllerConnector to avoid SSR issues
// This creates a singleton that only initializes when accessed in the browser
let controllerConnectorInstance: ControllerConnector | null = null;
let initializationPromise: Promise<ControllerConnector | null> | null = null;

export function getControllerConnector(): ControllerConnector | null {
  // Only create connector in browser environment
  if (typeof window === 'undefined') {
    return null;
  }

  // Return existing instance if already created (singleton pattern)
  if (controllerConnectorInstance) {
    return controllerConnectorInstance;
  }

  // If initialization is in progress, return null (will be available on next call)
  if (initializationPromise) {
    return null;
  }

  try {
    // Chrome-specific: Wait for DOM to be fully ready before initializing WASM
    // This ensures the iframe container is available and WASM can load properly
    if (document.readyState !== 'complete') {
      // Wait for DOM to be ready, especially important for Chrome
      return null;
    }

    controllerConnectorInstance = new ControllerConnector({
      chains: [
        { rpcUrl: CARTridge_MAINNET_RPC },
      ],
      defaultChainId: constants.StarknetChainId.SN_MAIN,
    });
    return controllerConnectorInstance;
  } catch (error) {
    console.error('Failed to initialize ControllerConnector:', error);
    return null;
  }
}

// Export initialization function so it can be called on demand
export async function initializeControllerConnectorAsync(): Promise<ControllerConnector | null> {
  if (typeof window === 'undefined') {
    return null;
  }

  if (controllerConnectorInstance) {
    return controllerConnectorInstance;
  }

  if (initializationPromise) {
    return initializationPromise;
  }

  initializationPromise = new Promise((resolve) => {
    // Chrome needs extra time for WASM initialization
    // Use requestAnimationFrame to ensure DOM is ready
    const init = () => {
      try {
        // Double-check DOM is ready (Chrome-specific)
        if (document.readyState === 'complete') {
          // Chrome-specific: Additional check for Cartridge Controller script
          // Wait for window.cartridge to be available if it exists
          const isChrome = typeof navigator !== 'undefined' && /Chrome/.test(navigator.userAgent);
          
          if (isChrome && typeof (window as any).cartridge === 'undefined') {
            // Wait a bit more for Chrome to load the Cartridge script
            setTimeout(() => {
              requestAnimationFrame(init);
            }, 200);
            return;
          }

          controllerConnectorInstance = new ControllerConnector({
            chains: [
              { rpcUrl: CARTridge_MAINNET_RPC },
            ],
            defaultChainId: constants.StarknetChainId.SN_MAIN,
          });
          resolve(controllerConnectorInstance);
        } else {
          // Wait a bit more for Chrome
          setTimeout(() => {
            requestAnimationFrame(init);
          }, 100);
        }
      } catch (error) {
        console.error('Failed to initialize ControllerConnector:', error);
        resolve(null);
      }
    };

    if (document.readyState === 'complete') {
      // Chrome needs a small delay even after DOM is ready
      const isChrome = typeof navigator !== 'undefined' && /Chrome/.test(navigator.userAgent);
      if (isChrome) {
        setTimeout(() => {
          requestAnimationFrame(init);
        }, 100);
      } else {
        requestAnimationFrame(init);
      }
    } else {
      window.addEventListener('load', () => {
        const isChrome = typeof navigator !== 'undefined' && /Chrome/.test(navigator.userAgent);
        if (isChrome) {
          setTimeout(() => {
            requestAnimationFrame(init);
          }, 100);
        } else {
          requestAnimationFrame(init);
        }
      });
    }
  });

  return initializationPromise;
}

// Context to share connector setter with child components
interface ConnectorContextType {
  setConnectors: (connectors: ControllerConnector[]) => void;
}

const ConnectorContext = createContext<ConnectorContextType | null>(null);

export function useConnectorContext() {
  const context = useContext(ConnectorContext);
  if (!context) {
    throw new Error('useConnectorContext must be used within StarknetProvider');
  }
  return context;
}

export function StarknetProvider({ children }: { children: ReactNode }) {
  // Don't initialize connectors automatically - wait for user to click "Connect Wallet"
  // This prevents WASM from loading until the user explicitly requests a connection
  const [connectors, setConnectors] = useState<ControllerConnector[]>([]);

  return (
    <ConnectorContext.Provider value={{ setConnectors }}>
      <StarknetConfig
        autoConnect={false}
        chains={[mainnet]}
        provider={provider}
        connectors={connectors}
        explorer={starkscan}
      >
        {children}
      </StarknetConfig>
    </ConnectorContext.Provider>
  );
}

