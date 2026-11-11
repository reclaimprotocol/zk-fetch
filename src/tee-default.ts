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
