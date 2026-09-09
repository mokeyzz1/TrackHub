#!/usr/bin/env node

const CENTRAL_TIME_ZONE = 'America/Chicago';

function centralClock(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: CENTRAL_TIME_ZONE,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: parts.weekday,
    hour: Number(parts.hour),
  };
}

function shouldRun(policy, clock) {
  if (policy === 'meet-discovery') {
    return ['Mon', 'Thu', 'Fri'].includes(clock.weekday) && clock.hour === 6;
  }
  if (policy === 'meet-lifecycle') {
    const meetDay = ['Wed', 'Thu', 'Fri', 'Sat', 'Sun'].includes(clock.weekday);
    return clock.hour === 6 || (meetDay && clock.hour >= 8 && clock.hour <= 23);
  }
  if (policy === 'weekend-results') {
    return (clock.weekday === 'Sun' && clock.hour === 22)
      || (clock.weekday === 'Mon' && clock.hour === 8);
  }
  throw new Error(`Unknown Central schedule policy: ${policy}`);
}

if (require.main === module) {
  const policy = process.argv[2];
  if (!policy) {
    console.error('Usage: central-schedule-gate.js <meet-discovery|meet-lifecycle|weekend-results>');
    process.exit(2);
  }
  try {
    process.stdout.write(shouldRun(policy, centralClock()) ? 'true' : 'false');
  } catch (error) {
    console.error(error.message);
    process.exit(2);
  }
}

module.exports = { CENTRAL_TIME_ZONE, centralClock, shouldRun };
