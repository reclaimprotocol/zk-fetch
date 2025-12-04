import * as bindings from './bindings';
import * as fs from 'fs';
import * as path from 'path';
import {
  ReclaimError,
  AlgorithmID,
  TeeProtocolResult,
  TeeProviderRequest,
  TeeReclaimConfig,
} from './interfaces';


// Circuit configuration
export interface CircuitConfig {
  algorithmId: AlgorithmID;
  pkFile: string;
  r1csFile: string;
  name: string;
}

export class ReclaimProtocolError extends Error {
  public readonly code: ReclaimError;

  constructor(code: ReclaimError, message?: string) {
    super(message || bindings.getErrorMessage(code));
    this.code = code;
    this.name = 'ReclaimProtocolError';
  }
}

/**
 * Reclaim SDK class for executing the TEE protocol
 */
export class ReclaimSDK {
  private initialized = false;
  private libraryPath?: string;

  /**
   * Create a new ReclaimSDK instance
   * @param libraryPath - Optional path to libreclaim.so
   */
  constructor(libraryPath?: string) {
    this.libraryPath = libraryPath;
  }

  /**
   * Initialize the SDK by loading the native library
   */
  public init(): void {
    if (this.initialized) {
      return;
    }
    bindings.loadLibrary(this.libraryPath);
    this.initialized = true;
  }

  /**
   * Get the library version
   */
  public getVersion(): string {
    this.ensureInitialized();
    return bindings.getVersion();
  }

  /**
   * Initialize a single ZK algorithm with proving key and R1CS files
   * @param algorithmId - Algorithm ID
   * @param provingKey - Proving key buffer
   * @param r1cs - R1CS buffer
   * @returns true if successful
   */
  public initAlgorithm(
    algorithmId: AlgorithmID,
    provingKey: Buffer,
    r1cs: Buffer
  ): boolean {
    this.ensureInitialized();
    return bindings.initAlgorithm(algorithmId, provingKey, r1cs);
  }

  /**
   * Execute the Reclaim protocol
   * @param request - Provider request data
   * @param config - Optional configuration
   * @returns Protocol result with claim and signatures
   * @throws ReclaimProtocolError on failure
   */
  public executeProtocol(
    request: TeeProviderRequest,
    config?: TeeReclaimConfig
  ): TeeProtocolResult {
    this.ensureInitialized();

    const requestJson = JSON.stringify(request);
    const configJson = config ? JSON.stringify(config) : undefined;

    const { error, claimJson, rawPointer } = bindings.executeProtocol(
      requestJson,
      configJson
    );

    if (error !== ReclaimError.SUCCESS) {
      // Free the pointer even on error if it was allocated
      if (rawPointer) {
        bindings.freePointer(rawPointer);
      }
      throw new ReclaimProtocolError(error);
    }

    if (!claimJson) {
      if (rawPointer) {
        bindings.freePointer(rawPointer);
      }
      throw new ReclaimProtocolError(
        ReclaimError.MEMORY,
        'No claim data returned'
      );
    }

    try {
      return JSON.parse(claimJson) as TeeProtocolResult;
    } finally {
      // Free the allocated pointer
      if (rawPointer) {
        bindings.freePointer(rawPointer);
      }
    }
  }

  /**
   * Execute the protocol asynchronously (wraps sync call in a Promise)
   */
  public async executeProtocolAsync(
    request: TeeProviderRequest,
    config?: TeeReclaimConfig
  ): Promise<TeeProtocolResult> {
    return new Promise((resolve, reject) => {
      setImmediate(() => {
        try {
          const result = this.executeProtocol(request, config);
          resolve(result);
        } catch (err) {
          reject(err);
        }
      });
    });
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      this.init();
    }
  }
}

// Convenience function for one-off usage
export function createReclaimSDK(libraryPath?: string): ReclaimSDK {
  const sdk = new ReclaimSDK(libraryPath);
  sdk.init();
  return sdk;
}
