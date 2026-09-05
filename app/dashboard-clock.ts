const dashboardClockMinuteMs = 60_000;

export function millisecondsUntilNextDashboardMinute(now: Date): number {
  const timestamp = now.getTime();
  if (!Number.isFinite(timestamp)) return dashboardClockMinuteMs;
  const elapsed = ((timestamp % dashboardClockMinuteMs) + dashboardClockMinuteMs) % dashboardClockMinuteMs;
  return elapsed === 0 ? dashboardClockMinuteMs : dashboardClockMinuteMs - elapsed;
}

type DashboardTimer = number | ReturnType<typeof setTimeout>;
type SetDashboardTimer = (callback: () => void, delay: number) => DashboardTimer;
type ClearDashboardTimer = (timer: DashboardTimer) => void;

function setDashboardTimer(callback: () => void, delay: number): DashboardTimer {
  return setTimeout(callback, delay);
}

function clearDashboardTimer(timer: DashboardTimer) {
  clearTimeout(timer);
}

export function scheduleDashboardClock({
  now,
  onTick,
  setTimer = setDashboardTimer,
  clearTimer = clearDashboardTimer,
}: {
  now: () => Date;
  onTick: (now: Date) => void;
  setTimer?: SetDashboardTimer;
  clearTimer?: ClearDashboardTimer;
}): () => void {
  let stopped = false;
  let timer: DashboardTimer | null = null;

  const schedule = () => {
    timer = setTimer(() => {
      timer = null;
      if (stopped) return;
      onTick(now());
      schedule();
    }, millisecondsUntilNextDashboardMinute(now()));
  };

  schedule();
  return () => {
    stopped = true;
    if (timer !== null) clearTimer(timer);
    timer = null;
  };
}
