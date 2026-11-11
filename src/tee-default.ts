import { Options, secretOptions } from './interfaces';

/**
 * Decides whether a zkFetch call runs in TEE mode.
 *
 * TEE is the default. An explicit `useTee` always wins; otherwise the call
 * stays on the non-TEE path when it asks for something only that path
 * supports (a `zkEngine`, or an `oprf-raw` redaction hash) or when this
 * platform has no TEE library, so code written before TEE was the default
 * keeps working.
 */
export function resolveUseTee(
  options: Options | undefined,
  secret: secretOptions | undefined,
  teePlatformSupported: boolean
): boolean {
  if (typeof options?.useTee === 'boolean') {
    return options.useTee;
  }
  if (options?.zkEngine) {
    return false;
  }
  if (secret?.responseRedactions?.some((redaction) => redaction.hash === 'oprf-raw')) {
    return false;
  }
  return teePlatformSupported;
}

/**
 * Redactions as sent to the TEE library. The deprecated 'oprf' hash becomes
 * 'oprf-mpc': zk-fetch never loaded the circuits 'oprf' needs on the TEE
 * path, so it couldn't produce a proof, and 'oprf-mpc' is the TEE's OPRF hash.
 */
export function teeRedactions(redactions: secretOptions['responseRedactions']) {
  return (redactions || []).map((redaction) =>
    redaction.hash === 'oprf' ? { ...redaction, hash: 'oprf-mpc' as const } : redaction
  );
}
