import { isStorageError, Network, NotFound, QuotaExceeded, type StorageError } from '../adapter.ts';

const quota = /^E(GOING|SHARER)?OVERQUOTA\b/;
const bandwidthLimit = /^Bandwidth limit reached/;
const unavailableLink = /^(ENOENT|EBLOCKED|EACCESS)\b|^Attributes could not be decrypted/;

export function toStorageError(thrown: unknown): StorageError {
  if (isStorageError(thrown)) return thrown;
  const message = thrown instanceof Error ? thrown.message : String(thrown);
  if (quota.test(message)) return new QuotaExceeded(message);
  if (bandwidthLimit.test(message)) return new QuotaExceeded(message, retryAfter(thrown));
  if (unavailableLink.test(message)) return new NotFound(message);
  return new Network(message);
}

function retryAfter(thrown: unknown): number | undefined {
  const seconds = Number((thrown as { timeLimit?: unknown }).timeLimit ?? Number.NaN);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : undefined;
}
