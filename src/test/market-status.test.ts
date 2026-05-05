import { describe, it, expect } from "vitest";

// Test the market status logic from the Supabase function
const markets = {
  NYSE: { timeZone: 'America/New_York', openHour: 9.5, closeHour: 16 },
  NASDAQ: { timeZone: 'America/New_York', openHour: 9.5, closeHour: 16 },
  NSE: { timeZone: 'Asia/Kolkata', openHour: 9.25, closeHour: 15.5 },
  BSE: { timeZone: 'Asia/Kolkata', openHour: 9.25, closeHour: 15.5 },
};

function getLocalTimeParts(date: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
  const parts = fmt.formatToParts(date);
  const values: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== 'literal') {
      values[part.type] = part.value;
    }
  }
  return {
    weekday: values.weekday,
    hour: Number(values.hour),
    minute: Number(values.minute),
  };
}

function isMarketOpenNow(market: string, now = Date.now()) {
  const tradingHours = markets[market as keyof typeof markets];
  if (!tradingHours) return false;
  const { timeZone, openHour, closeHour } = tradingHours;
  const { weekday, hour, minute } = getLocalTimeParts(new Date(now), timeZone);
  const current = hour + minute / 60;
  return !(weekday === 'Sat' || weekday === 'Sun') && current >= openHour && current < closeHour;
}

describe("Market Status Logic", () => {
  it("should correctly identify open markets", () => {
    // Test with a known time when NSE/BSE are open
    const testTime = new Date('2026-05-05T05:08:13.074Z'); // UTC time when NSE/BSE are open

    expect(isMarketOpenNow('NSE', testTime.getTime())).toBe(true);
    expect(isMarketOpenNow('BSE', testTime.getTime())).toBe(true);
  });

  it("should correctly identify closed markets", () => {
    // Test with a known time when US markets are closed
    const testTime = new Date('2026-05-05T05:08:13.074Z'); // UTC time when US markets are closed

    expect(isMarketOpenNow('NYSE', testTime.getTime())).toBe(false);
    expect(isMarketOpenNow('NASDAQ', testTime.getTime())).toBe(false);
  });

  it("should handle weekends correctly", () => {
    // Test with a Saturday
    const saturday = new Date('2026-05-10T12:00:00.000Z'); // Saturday

    expect(isMarketOpenNow('NSE', saturday.getTime())).toBe(false);
    expect(isMarketOpenNow('NYSE', saturday.getTime())).toBe(false);
  });
});