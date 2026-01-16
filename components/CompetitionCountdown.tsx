'use client';

import { useEffect, useMemo, useState } from 'react';

type TimeLeft = { days: number; hours: number; minutes: number };

interface CompetitionCountdownProps {
  title?: string;
  endsAtUtcMs?: number;
}

export function CompetitionCountdown({
  title = '75k STRK Competition ends in:',
  // Feb 16, 2026 23:59 UTC
  endsAtUtcMs = Date.UTC(2026, 1, 16, 23, 59, 0),
}: CompetitionCountdownProps) {
  const computeTimeLeft = useMemo(() => {
    return (): TimeLeft => {
      const diffMs = Math.max(0, endsAtUtcMs - Date.now());
      const days = Math.floor(diffMs / 86_400_000);
      const hours = Math.floor((diffMs % 86_400_000) / 3_600_000);
      const minutes = Math.floor((diffMs % 3_600_000) / 60_000);
      return { days, hours, minutes };
    };
  }, [endsAtUtcMs]);

  const [timeLeft, setTimeLeft] = useState<TimeLeft>(() => computeTimeLeft());

  useEffect(() => {
    setTimeLeft(computeTimeLeft());
    const id = window.setInterval(() => setTimeLeft(computeTimeLeft()), 30_000);
    return () => window.clearInterval(id);
  }, [computeTimeLeft]);

  return (
    <div className="rounded-lg border border-dungeon-border bg-dungeon-green p-4 sm:p-6">
      <div className="rounded-lg border border-dungeon-border bg-dungeon-dark/60 px-3 py-2">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="text-dungeon-text text-sm font-semibold">{title}</div>
          <div className="flex items-center gap-2 text-white tabular-nums">
            <div className="flex items-baseline gap-1 rounded-md border border-dungeon-border bg-dungeon-dark px-2 py-1 whitespace-nowrap">
              <span className="font-bold">{timeLeft.days}</span>
              <span className="text-[10px] uppercase tracking-wide text-gray-300">Days</span>
            </div>
            <div className="flex items-baseline gap-1 rounded-md border border-dungeon-border bg-dungeon-dark px-2 py-1 whitespace-nowrap">
              <span className="font-bold">{String(timeLeft.hours).padStart(2, '0')}</span>
              <span className="text-[10px] uppercase tracking-wide text-gray-300">Hrs</span>
            </div>
            <div className="flex items-baseline gap-1 rounded-md border border-dungeon-border bg-dungeon-dark px-2 py-1 whitespace-nowrap">
              <span className="font-bold">{String(timeLeft.minutes).padStart(2, '0')}</span>
              <span className="text-[10px] uppercase tracking-wide text-gray-300">Min</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

