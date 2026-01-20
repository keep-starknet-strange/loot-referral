'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useReferral } from '@/hooks/useReferral';
import { 
  useConnect, 
  useDisconnect, 
  useAccount,
} from '@starknet-react/core';
import { useConnectorContext, initializeControllerConnectorAsync, getControllerConnector } from '@/providers/StarknetProvider';

type LoadingState = 'idle' | 'connecting' | 'saving' | 'redirecting';

export default function PlayPage() {
  const { referralAddress, submitReferral, isProcessing } = useReferral();
  const { connect, connectors } = useConnect();
  const { address, isConnected } = useAccount();
  const { setConnectors } = useConnectorContext();
  
  const [loadingState, setLoadingState] = useState<LoadingState>('idle');
  const [referralSaved, setReferralSaved] = useState(false);
  const [metrics, setMetrics] = useState<{
    lordsDistributed: { value: string | null; updatedAt: string | null } | null;
    beastsCollected: { value: string | null; updatedAt: string | null } | null;
  } | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(true);
  const hasAutoRedirectedRef = useRef(false);
  const submittedAddressRef = useRef<string | null>(null);

  const formatMetricValue = (value: string | null) => {
    if (!value) return '—';
    const cleaned = value.replace(/,/g, '').trim();
    if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return value;
    const [intPartRaw, fracRaw] = cleaned.split('.');
    const isNegative = intPartRaw.startsWith('-');
    const intPart = isNegative ? intPartRaw.slice(1) : intPartRaw;
    const intWithCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    if (!fracRaw || /^0+$/.test(fracRaw)) return `${isNegative ? '-' : ''}${intWithCommas}`;
    const fracTrimmed = fracRaw.replace(/0+$/g, '').slice(0, 4);
    return `${isNegative ? '-' : ''}${intWithCommas}.${fracTrimmed}`;
  };

  // Load headline metrics (from Dune) to make CTA more compelling
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/metrics', { method: 'GET' });
        if (!res.ok) throw new Error('Failed to load metrics');
        const data = await res.json();
        if (cancelled) return;
        setMetrics({
          lordsDistributed: data?.lordsDistributed ?? null,
          beastsCollected: data?.beastsCollected ?? null,
        });
      } catch {
        if (!cancelled) setMetrics(null);
      } finally {
        if (!cancelled) setMetricsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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

  // Handle wallet connection
  const handleConnect = useCallback(async () => {
    setLoadingState('connecting');
    
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
      setLoadingState('idle');
    }
  }, [connect, controllerConnector, setConnectors]);

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
          disabled={loadingState !== 'idle' && loadingState !== 'connecting'}
          className="px-12 py-6 md:px-16 md:py-8 bg-dungeon-yellow hover:bg-dungeon-yellow-dark text-black text-xl md:text-2xl font-bold rounded-lg shadow-2xl transform transition-all duration-200 hover:scale-105 active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed disabled:transform-none relative overflow-hidden"
        >
          {/* Button shine effect */}
          <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full animate-shine"></span>
          <span className="relative z-10">{getButtonContent()}</span>
        </button>

        {/* CTA subtitle + metrics */}
        <div className="mt-6 w-full max-w-xl text-center">
          <p className="text-base md:text-lg text-gray-200/90">
            Survive. Earn <span className="text-dungeon-yellow">$SURVIVOR</span>. Collect{' '}
            <span className="text-dungeon-green-glow">$BEASTS</span>.
          </p>

          <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-dungeon-yellow/30 bg-dungeon-yellow/10 px-4 py-2 text-sm text-gray-200">
            <span className="text-dungeon-yellow font-bold">+ 105,000 STRK</span>
            <span className="text-gray-200/90">up for grabs in tournaments </span>
          </div>

          <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-xl border border-dungeon-green-light/40 bg-dungeon-green/20 backdrop-blur-sm px-5 py-4">
              <div className="text-xs uppercase tracking-wider text-gray-300">
                Total $SURVIVOR Distributed
              </div>
              <div
                className={[
                  'mt-2 text-2xl md:text-3xl font-bold',
                  metricsLoading ? 'text-gray-400 animate-pulse' : 'text-dungeon-yellow',
                ].join(' ')}
              >
                {(() => {
                  const v = formatMetricValue(metrics?.lordsDistributed?.value ?? null);
                  return v === '—' ? '—' : `${v} USD`;
                })()}
              </div>
            </div>

            <div className="rounded-xl border border-dungeon-green-light/40 bg-dungeon-green/20 backdrop-blur-sm px-5 py-4">
              <div className="text-xs uppercase tracking-wider text-gray-300">
                Total $BEASTS collected
              </div>
              <div
                className={[
                  'mt-2 text-2xl md:text-3xl font-bold',
                  metricsLoading ? 'text-gray-400 animate-pulse' : 'text-dungeon-green-glow',
                ].join(' ')}
              >
                {formatMetricValue(metrics?.beastsCollected?.value ?? null)}
              </div>
            </div>
          </div>
        </div>

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

