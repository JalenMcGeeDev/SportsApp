import { Temporal } from "@js-temporal/polyfill";

export function localDateTime(instant: string, timezone: string) {
  return Temporal.Instant.from(instant).toZonedDateTimeISO(timezone).toPlainDateTime().toString({ smallestUnit: "minute" });
}

export function localToInstant(value: string, timezone: string) {
  try {
    return Temporal.PlainDateTime.from(value).toZonedDateTime(timezone, { disambiguation: "reject" }).toInstant().toString({ fractionalSecondDigits: 3 });
  } catch {
    throw new Error(`Enter a valid, unambiguous local time in ${timezone}. This time may fall within a daylight-saving clock change.`);
  }
}