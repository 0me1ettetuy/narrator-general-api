import { Temporal } from '@js-temporal/polyfill';

const globalWithTemporal = globalThis as typeof globalThis & {
  Temporal?: typeof Temporal;
};

globalWithTemporal.Temporal ??= Temporal;

export type Instant = Temporal.Instant;

export const temporalNow = (): Instant => Temporal.Now.instant();

export const temporalFromEpochMilliseconds = (
  epochMilliseconds: number,
): Instant => Temporal.Instant.fromEpochMilliseconds(epochMilliseconds);

export const temporalInstantIsExpired = (instant: Instant): boolean =>
  Temporal.Instant.compare(instant, temporalNow()) <= 0;
