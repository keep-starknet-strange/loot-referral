'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
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
} from '@/providers/StarknetProvider';

type LoadingState = 'idle' | 'connecting' | 'saving' | 'redirecting';

export default function PlayPage() {
  const { referralAddress, submitReferral } = useReferral();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const { address, isConnected } = useAccount();
  const { setConnectors } = useConnectorContext();
  
  const [loadingState, setLoadingState] = useState<LoadingState>('idle');
  const [referralSaved, setReferralSaved] = useState(false);
  const hasAutoRedirectedRef = useRef(false);
  const submittedAddressRef = useRef<string | null>(null);

  // Get the Controller connector
  const controllerConnector = connectors.find(
    (connector) => connector.id === 'controller' || connector.name?.toLowerCase().includes('controller')
  ) || connectors[0];

  // Handle referral submission and redirect
  const handleReferralAndRedirect = useCallback(async (walletAddress: string) => {
    // If there's a referral to save, save it first
    if (referralAddress && submittedAddressRef.current !== walletAddress) {
      setLoadingState('saving');
      submittedAddressRef.current = walletAddress;
      
      try {
        const success = await submitReferral(walletAddress);
        if (success) {
          setReferralSaved(true);
        }
      } catch (error) {
        console.error('Error saving referral:', error);
        // Continue with redirect even if referral save fails
      }
    }

    // Small delay to show "Referral Active" badge if applicable
    if (referralAddress) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Redirect to game
    setLoadingState('redirecting');
    window.location.href = 'https://lootsurvivor.io/survivor';
  }, [referralAddress, submitReferral]);

  // Auto-redirect if already connected (avoiding the "flash")
  useEffect(() => {
    if (isConnected && address && !hasAutoRedirectedRef.current) {
      hasAutoRedirectedRef.current = true;
      // Small delay to ensure connection is fully established
      const timer = setTimeout(() => {
        handleReferralAndRedirect(address);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isConnected, address, handleReferralAndRedirect]);

  const resetFailedConnectAttempt = useCallback(async () => {
    try {
      await disconnect();
    } catch {
      // ignore
    }
    resetControllerConnector();
    setConnectors([]);
  }, [disconnect, setConnectors]);

  // If the user closes the Controller modal without completing the flow, reset so they can retry.
  useEffect(() => {
    if (loadingState !== 'connecting') return;
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

      if ((sawModal && !isConnected) || timedOut) {
        cancelled = true;
        setLoadingState('idle');
        resetFailedConnectAttempt();
        clearInterval(poll);
      }
    }, 350);

    return () => {
      cancelled = true;
      clearInterval(poll);
    };
  }, [loadingState, isConnected, resetFailedConnectAttempt]);

  // Handle wallet connection
  const handleConnect = useCallback(async () => {
    setLoadingState('connecting');
    
    // Remove stale/hidden controller container before starting a new connect.
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

    let connectorToUse = controllerConnector;

    // If connector is not available, initialize it now
    if (!connectorToUse) {
      try {
        const newConnector = getControllerConnector();
        const initializedConnector = newConnector || await initializeControllerConnectorAsync();

        if (!initializedConnector) {
          console.error('Failed to initialize Controller connector');
          setLoadingState('idle');
          return;
        }

        setConnectors([initializedConnector]);
        await new Promise(resolve => setTimeout(resolve, 100));
        connectorToUse = initializedConnector;
      } catch (err) {
        console.error('Error initializing connector:', err);
        setLoadingState('idle');
        return;
      }
    }

    if (!connectorToUse) {
      console.error('Controller connector not found');
      setLoadingState('idle');
      return;
    }

    try {
      await connect({ connector: connectorToUse });
      // The useEffect will handle the referral and redirect after connection
    } catch (err) {
      console.error('Error connecting wallet:', err);
      const message = err instanceof Error ? err.message : String(err ?? '');
      const retry =
        message.toLowerCase().includes('destroyed connection') ||
        message.toLowerCase().includes('account not initialized');

      await resetFailedConnectAttempt();

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

      setLoadingState('idle');
    }
  }, [connect, controllerConnector, initializeControllerConnectorAsync, isConnected, resetFailedConnectAttempt, setConnectors]);

  // Handle button click for already connected users
  const handleResumeAdventure = useCallback(async () => {
    if (address) {
      await handleReferralAndRedirect(address);
    }
  }, [address, handleReferralAndRedirect]);

  // Get button text and action based on state
  const getButtonContent = () => {
    if (loadingState === 'connecting') {
      return 'Connecting...';
    }
    if (loadingState === 'saving') {
      return 'Saving Referral...';
    }
    if (loadingState === 'redirecting') {
      return 'Entering the Dungeon...';
    }
    if (isConnected && address) {
      return 'Resume Adventure';
    }
    return 'Enter the Dungeon';
  };

  const handleButtonClick = () => {
    if (isConnected && address) {
      handleResumeAdventure();
    } else {
      handleConnect();
    }
  };

  return (
    <div className="min-h-screen bg-dungeon-dark flex flex-col items-center justify-center relative overflow-hidden">
      {/* Background effects for loading screen aesthetic */}
      <div className="absolute inset-0 opacity-20">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-dungeon-green-glow rounded-full blur-3xl"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-dungeon-green-glow rounded-full blur-3xl"></div>
      </div>

      {/* Main content */}
      <div className="relative z-10 flex flex-col items-center justify-center px-4">
        {/* Title */}
        <h1 className="text-5xl md:text-7xl font-bold mb-8 text-center bg-gradient-to-r from-dungeon-green-glow via-dungeon-yellow to-dungeon-green-glow bg-clip-text text-transparent animate-pulse">
          Loot Survivor 2
        </h1>

        {/* Subtitle */}
        <p className="text-xl md:text-2xl text-gray-300 mb-12 text-center">
          You have been invited by a friend!
        </p>

        {/* Main Button */}
        <button
          onClick={handleButtonClick}
          disabled={loadingState !== 'idle'}
          className="px-12 py-6 md:px-16 md:py-8 bg-dungeon-yellow hover:bg-dungeon-yellow-dark text-black text-xl md:text-2xl font-bold rounded-lg shadow-2xl transform transition-all duration-200 hover:scale-105 active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed disabled:transform-none relative overflow-hidden"
        >
          {/* Button shine effect */}
          <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full animate-shine"></span>
          <span className="relative z-10">{getButtonContent()}</span>
        </button>

        {/* Loading indicator */}
        {(loadingState === 'connecting' || loadingState === 'saving' || loadingState === 'redirecting') && (
          <div className="mt-8 flex items-center gap-3 text-gray-300">
            <div className="w-2 h-2 bg-dungeon-green-glow rounded-full animate-bounce"></div>
            <div className="w-2 h-2 bg-dungeon-green-glow rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
            <div className="w-2 h-2 bg-dungeon-green-glow rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
          </div>
        )}
      </div>

      {/* Referral Active Badge - subtle at bottom */}
      {referralSaved && (
        <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 z-10">
          <div className="bg-dungeon-green-glow/20 border border-dungeon-green-glow/50 rounded-full px-4 py-2 flex items-center gap-2 backdrop-blur-sm">
            <div className="w-2 h-2 bg-dungeon-green-glow rounded-full animate-pulse"></div>
            <span className="text-dungeon-green-glow text-sm font-medium">Referral Active</span>
          </div>
        </div>
      )}
    </div>
  );
}

