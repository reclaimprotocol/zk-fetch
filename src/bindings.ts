import koffi from 'koffi';
import path from 'path';
import { ReclaimError, AlgorithmID } from './interfaces';

// Define GoSlice struct for passing byte arrays to Go
const GoSlice = koffi.struct('GoSlice', {
  data: 'void*',
  len: 'int64',
  cap: 'int64',
});

// Library instance
let lib: koffi.IKoffiLib | null = null;

// Function pointers
let _reclaim_execute_protocol: koffi.KoffiFunction | null = null;
let _reclaim_free_string: koffi.KoffiFunction | null = null;
let _reclaim_get_error_message: koffi.KoffiFunction | null = null;
let _reclaim_get_version: koffi.KoffiFunction | null = null;
let _init_algorithm: koffi.KoffiFunction | null = null;

/**
 * Get the platform and architecture-specific library path
 */
function getDefaultLibraryPath(): string {
  const arch = process.arch;
  const platform = process.platform;

  // Map Node.js arch to Go arch naming
  let archDir: string;
  switch (arch) {
    case 'x64':
      archDir = 'amd64';
      break;
    case 'arm64':
      archDir = 'arm64';
      break;
    default:
      throw new Error(`Unsupported architecture: ${arch}`);
  }

  // Map Node.js platform to library extension and directory
  let platformDir: string;
  let libExt: string;
  switch (platform) {
    case 'darwin':
      platformDir = 'darwin';
      libExt = 'dylib';
      break;
    case 'linux':
      platformDir = 'linux';
      libExt = 'so';
      break;
    default:
      throw new Error(`Unsupported platform: ${platform}. Only macOS and Linux are supported (Windows is not supported due to TEE/Nitro Enclave dependencies).`);
  }

  return path.resolve(__dirname, '..', 'lib', platformDir, archDir, `libreclaim.${libExt}`);
}

/**
 * Load the libreclaim shared library
 * @param libraryPath - Path to libreclaim.so (optional, auto-detects architecture if not provided)
 */
export function loadLibrary(libraryPath?: string): void {
  if (lib) {
    return; // Already loaded
  }

  const libPath = libraryPath || getDefaultLibraryPath();

  lib = koffi.load(libPath);

  // Define function signatures
  // reclaim_execute_protocol(char* request_json, char* config_json, char** claim_json, int* claim_length) -> int
  _reclaim_execute_protocol = lib.func('reclaim_execute_protocol', 'int', [
    'str',             // request_json
    'str',             // config_json
    '_Out_ void**',    // claim_json (output pointer - raw pointer for proper freeing)
    '_Out_ int*',      // claim_length (output pointer)
  ]);

  // reclaim_free_string(char* str) -> void
  _reclaim_free_string = lib.func('reclaim_free_string', 'void', ['void*']);

  // Define disposable string type that auto-frees with reclaim_free_string
  const disposableStr = koffi.disposable('str', (ptr: unknown) => {
    if (ptr) {
      _reclaim_free_string!(ptr);
    }
  });

  // reclaim_get_error_message(int error) -> char* (auto-freed)
  _reclaim_get_error_message = lib.func('reclaim_get_error_message', disposableStr, ['int']);

  // reclaim_get_version() -> char* (auto-freed)
  _reclaim_get_version = lib.func('reclaim_get_version', disposableStr, []);

  // InitAlgorithm(uint8 algorithmID, GoSlice provingKey, GoSlice r1cs) -> uint8
  _init_algorithm = lib.func('InitAlgorithm', 'uint8', ['uint8', GoSlice, GoSlice]);
}

// Store for raw pointers that need to be freed
export type RawPointer = unknown;

/**
 * Execute the Reclaim protocol
 * @param requestJson - JSON string containing the request parameters
 * @param configJson - JSON string containing configuration (optional)
 * @returns Object with error code, claim JSON, and raw pointer for cleanup
 */
export function executeProtocol(
  requestJson: string,
  configJson?: string
): { error: ReclaimError; claimJson: string | null; claimLength: number; rawPointer: RawPointer | null } {
  if (!lib || !_reclaim_execute_protocol) {
    throw new Error('Library not loaded. Call loadLibrary() first.');
  }

  // Create output pointers
  const claimJsonPtr: [RawPointer | null] = [null];
  const claimLengthPtr = [0];

  const error = _reclaim_execute_protocol(
    requestJson,
    configJson || '',
    claimJsonPtr,
    claimLengthPtr
  ) as ReclaimError;

  const rawPointer = claimJsonPtr[0];
  const claimLength = claimLengthPtr[0] as number;

  // Decode the raw pointer to string if we have data
  let claimJson: string | null = null;
  if (rawPointer && claimLength > 0) {
    // Decode as array of uint8 bytes and convert to string via Buffer
    const byteArray = koffi.decode(rawPointer, koffi.array('uint8', claimLength)) as number[];
    claimJson = Buffer.from(byteArray).toString('utf8');
  }

  return { error, claimJson, claimLength, rawPointer };
}

/**
 * Free a pointer allocated by the library
 * @param ptr - Raw pointer to free (from executeProtocol's rawPointer)
 */
export function freePointer(ptr: RawPointer | null): void {
  if (!lib || !_reclaim_free_string) {
    throw new Error('Library not loaded. Call loadLibrary() first.');
  }

  if (ptr !== null) {
    _reclaim_free_string(ptr);
  }
}

/**
 * Get human-readable error message for an error code
 * @param error - Error code
 * @returns Error message string
 */
export function getErrorMessage(error: ReclaimError): string {
  if (!lib || !_reclaim_get_error_message) {
    throw new Error('Library not loaded. Call loadLibrary() first.');
  }

  return _reclaim_get_error_message(error) as string;
}

/**
 * Get the library version
 * @returns Version string
 */
export function getVersion(): string {
  if (!lib || !_reclaim_get_version) {
    throw new Error('Library not loaded. Call loadLibrary() first.');
  }

  return _reclaim_get_version() as string;
}

/**
 * Initialize a ZK algorithm with proving key and R1CS
 * @param algorithmId - Algorithm ID (use AlgorithmID enum)
 * @param provingKey - Proving key bytes
 * @param r1cs - R1CS constraint system bytes
 * @returns true if initialization succeeded, false otherwise
 */
export function initAlgorithm(
  algorithmId: AlgorithmID,
  provingKey: Buffer,
  r1cs: Buffer
): boolean {
  if (!lib || !_init_algorithm) {
    throw new Error('Library not loaded. Call loadLibrary() first.');
  }

  // Create GoSlice structures
  const pkSlice = {
    data: provingKey,
    len: BigInt(provingKey.length),
    cap: BigInt(provingKey.length),
  };

  const r1csSlice = {
    data: r1cs,
    len: BigInt(r1cs.length),
    cap: BigInt(r1cs.length),
  };

  const result = _init_algorithm(algorithmId, pkSlice, r1csSlice) as number;
  return result !== 0;
}
