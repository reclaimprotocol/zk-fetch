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


// Re-export TEE interfaces for convenience
export type {
  TeeSignature,
  TeeClaimData,
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
   * Initialize ZK circuits from a directory containing circuit files
   * @param circuitsPath - Path to directory containing pk.* and r1cs.* files
   * @param circuits - Optional custom circuit configurations (defaults to all OPRF circuits)
   * @throws Error if circuit files are not found or initialization fails
   */
  public initializeZKCircuits(
    circuitsPath: string,
    circuits: CircuitConfig[]
  ): void {
    this.ensureInitialized();

    if (!fs.existsSync(circuitsPath)) {
      throw new Error(`Circuits directory not found: ${circuitsPath}`);
    }

    for (const circuit of circuits) {
      const pkPath = path.join(circuitsPath, circuit.pkFile);
      const r1csPath = path.join(circuitsPath, circuit.r1csFile);

      if (!fs.existsSync(pkPath)) {
        throw new Error(`Proving key not found: ${pkPath}`);
      }
      if (!fs.existsSync(r1csPath)) {
        throw new Error(`R1CS file not found: ${r1csPath}`);
      }

      const pkData = fs.readFileSync(pkPath);
      const r1csData = fs.readFileSync(r1csPath);

      const success = bindings.initAlgorithm(circuit.algorithmId, pkData, r1csData);
      if (!success) {
        throw new Error(`Failed to initialize ${circuit.name} circuit`);
      }
    }
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

// Re-export bindings for advanced usage
export { loadLibrary, getErrorMessage, getVersion, initAlgorithm, freePointer } from './bindings';
