const fs = require('fs');
const path = require('path');
const https = require('https');
const os = require('os');

// Configuration
const CONFIG = {
  REPO: 'reclaimprotocol/zk-symmetric-crypto',
  MAX_REDIRECTS: 10,
  MAX_RETRIES: 3,
  REQUEST_TIMEOUT_MS: 30000,
  HEAD_REQUEST_TIMEOUT_MS: 10000,
  GITHUB_API_TIMEOUT_MS: 10000,
  EXPONENTIAL_BACKOFF_BASE: 2,
  USER_AGENT: 'zk-fetch-downloader/1.0'
};

// Resource definitions
const RESOURCES = {
  ciphers: ['chacha20', 'aes-256-ctr', 'aes-128-ctr'],
  files: ['circuit_final.zkey', 'circuit.wasm', 'circuit.r1cs']
};

// Target directories - handles different node_modules layouts
// Use path.resolve for cross-platform absolute paths
const TARGET_DIRS = [
  path.resolve(
    process.cwd(),
    'node_modules',
    '@reclaimprotocol',
    'attestor-core',
    'node_modules',
    '@reclaimprotocol',
    'zk-symmetric-crypto',
    'resources'
  ),
  path.resolve(
    process.cwd(),
    'node_modules',
    '@reclaimprotocol',
    'zk-symmetric-crypto',
    'resources'
  )
];

// Use OS temp directory for better cross-platform support
const TEMP_DIR = path.join(os.tmpdir(), 'zk-resources-temp-' + Date.now());

/**
 * Logger utility for consistent output formatting
 */
class Logger {
  static info(message) {
    console.log(`[INFO] ${new Date().toISOString()} - ${message}`);
  }

  static error(message, error = null) {
    console.error(`[ERROR] ${new Date().toISOString()} - ${message}`);
    if (error && error.stack) {
      console.error(`[STACK] ${error.stack}`);
    }
  }

  static progress(message) {
    // Cross-platform progress output
    const isWindows = process.platform === 'win32';
    const supportsAnsi = process.stdout.isTTY && !isWindows;
    
    if (supportsAnsi) {
      // Unix-like systems with TTY support
      process.stdout.write(`\r\x1B[K${message}`);
    } else {
      // Windows or non-TTY environments
      const clearLine = ' '.repeat(process.stdout.columns || 100);
      process.stdout.write('\r' + clearLine + '\r' + message);
    }
  }
}

/**
 * HTTP utility for making requests with proper error handling
 */
class HttpClient {
  static request(url, options = {}) {
    return new Promise((resolve, reject) => {
      const timeout = options.timeout || CONFIG.REQUEST_TIMEOUT_MS;
      const method = options.method || 'GET';
      
      const req = https.request(url, { 
        method,
        headers: {
          'User-Agent': CONFIG.USER_AGENT,
          ...options.headers
        }
      }, (res) => {
        if (options.followRedirects && [301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
          resolve({ redirect: res.headers.location });
          return;
        }

        if (method === 'HEAD') {
          resolve({ headers: res.headers, statusCode: res.statusCode });
          return;
        }

        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          resolve({ data, headers: res.headers, statusCode: res.statusCode });
        });
      });

      req.on('error', reject);
      req.setTimeout(timeout, () => {
        req.destroy();
        reject(new Error(`Request timeout after ${timeout}ms`));
      });

      req.end();
    });
  }
}

/**
 * GitHub API client
 */
class GitHubClient {
  static async getLatestCommitHash() {
    const url = `https://api.github.com/repos/${CONFIG.REPO}/commits/HEAD`;
    
    try {
      const response = await HttpClient.request(url, {
        timeout: CONFIG.GITHUB_API_TIMEOUT_MS
      });
      
      const json = JSON.parse(response.data);
      if (!json.sha) {
        throw new Error('Invalid GitHub API response: missing SHA');
      }
      
      return json.sha;
    } catch (error) {
      throw new Error(`Failed to fetch commit hash: ${error.message}`);
    }
  }

  static getResourceUrl(filePath, commitHash) {
    return `https://github.com/${CONFIG.REPO}/raw/${commitHash}/resources/${filePath}`;
  }
}

/**
 * File system utilities with async/await
 */
class FileSystem {
  static async ensureDirectory(dirPath) {
    await fs.promises.mkdir(dirPath, { recursive: true });
  }

  static async fileExists(filePath) {
    try {
      await fs.promises.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  static async cleanDirectory(dirPath) {
    await fs.promises.rm(dirPath, { recursive: true, force: true });
  }

  static async copyDirectory(source, destination) {
    await fs.promises.cp(source, destination, { recursive: true });
  }
}

/**
 * Download manager for handling file downloads with retry logic
 */
class DownloadManager {
  constructor(commitHash) {
    this.commitHash = commitHash;
    this.totalBytes = 0;
    this.downloadedBytes = 0;
    this.startTime = null;
  }

  async getFileSize(filePath, url = null, redirectCount = 0) {
    if (redirectCount >= CONFIG.MAX_REDIRECTS) {
      throw new Error(`Too many redirects for ${filePath}`);
    }

    if (!url) {
      url = GitHubClient.getResourceUrl(filePath, this.commitHash);
    }

    const response = await HttpClient.request(url, {
      method: 'HEAD',
      followRedirects: true,
      timeout: CONFIG.HEAD_REQUEST_TIMEOUT_MS
    });

    if (response.redirect) {
      return this.getFileSize(filePath, response.redirect, redirectCount + 1);
    }

    const size = parseInt(response.headers['content-length'], 10);
    return isNaN(size) ? 0 : size;
  }

  async downloadFile(filePath, targetPath, progressCallback, retries = CONFIG.MAX_RETRIES) {
    const dir = path.dirname(targetPath);
    await FileSystem.ensureDirectory(dir);

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        await this._downloadWithRedirects(filePath, targetPath, progressCallback);
        return;
      } catch (error) {
        if (attempt === retries) {
          throw new Error(`Failed to download ${filePath} after ${retries} attempts: ${error.message}`);
        }
        
        Logger.info(`Retry ${attempt}/${retries} for ${filePath}: ${error.message}`);
        const backoffMs = Math.pow(CONFIG.EXPONENTIAL_BACKOFF_BASE, attempt) * 1000;
        await new Promise(resolve => setTimeout(resolve, backoffMs));
      }
    }
  }

  async _downloadWithRedirects(filePath, targetPath, progressCallback, url = null, redirectCount = 0) {
    if (redirectCount >= CONFIG.MAX_REDIRECTS) {
      throw new Error(`Too many redirects for ${filePath}`);
    }

    if (!url) {
      url = GitHubClient.getResourceUrl(filePath, this.commitHash);
    }

    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(targetPath);
      
      const request = https.get(url, { 
        headers: { 'User-Agent': CONFIG.USER_AGENT }
      }, (response) => {
        if ([301, 302, 307, 308].includes(response.statusCode) && response.headers.location) {
          file.close();
          this._downloadWithRedirects(filePath, targetPath, progressCallback, response.headers.location, redirectCount + 1)
            .then(resolve)
            .catch(reject);
          return;
        }

        if (response.statusCode !== 200) {
          file.close();
          reject(new Error(`HTTP ${response.statusCode} for ${filePath}`));
          return;
        }

        response.on('data', (chunk) => {
          progressCallback(chunk.length);
        });

        response.pipe(file);

        file.on('finish', () => {
          file.close(() => resolve());
        });

        file.on('error', (err) => {
          fs.unlink(targetPath, () => reject(err));
        });
      });

      request.on('error', (err) => {
        file.close();
        fs.unlink(targetPath, () => reject(err));
      });

      request.setTimeout(CONFIG.REQUEST_TIMEOUT_MS, () => {
        request.destroy();
        reject(new Error(`Timeout downloading ${filePath}`));
      });
    });
  }
}

/**
 * Progress reporter for download tracking
 */
class ProgressReporter {
  static formatBytes(bytes) {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let unitIndex = 0;
    let value = bytes;
    
    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024;
      unitIndex++;
    }
    
    return `${value.toFixed(1)} ${units[unitIndex]}`;
  }

  static formatTime(seconds) {
    if (!isFinite(seconds) || seconds < 0) return '--';
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.round(seconds % 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  }

  static renderProgress(completed, total, downloaded, totalSize, speed, currentFile) {
    const progress = totalSize > 0 ? Math.min(downloaded / totalSize, 1) : 0;
    const percentage = (progress * 100).toFixed(1);
    const remaining = speed > 0 ? (totalSize - downloaded) / speed : 0;
    
    const barLength = 30;
    const filled = Math.round(progress * barLength);
    // Use cross-platform characters for progress bar
    const isWindows = process.platform === 'win32';
    const supportsUnicode = !isWindows && process.stdout.isTTY;
    const fillChar = supportsUnicode ? '█' : '#';
    const emptyChar = supportsUnicode ? '░' : '-';
    const bar = fillChar.repeat(filled) + emptyChar.repeat(barLength - filled);
    
    return `[${completed}/${total}] ${percentage}% [${bar}] ` +
           `${ProgressReporter.formatBytes(speed)}/s | ` +
           `ETA: ${ProgressReporter.formatTime(remaining)} | ` +
           `${currentFile}`;
  }
}

/**
 * Main application orchestrator
 */
class ZkResourceDownloader {
  async run() {
    try {
      await this.initialize();
      
      if (await this.checkExistingFiles()) {
        Logger.info('ZK circuit files already exist. Skipping download.');
        process.exit(0);
      }

      await this.downloadResources();
      await this.deployResources();
      await this.cleanup();
      
      Logger.info('ZK circuit files ready.');
      process.exit(0);
    } catch (error) {
      await this.handleError(error);
    }
  }

  async initialize() {
    Logger.info('Initializing ZK resource downloader...');
    
    this.commitHash = await GitHubClient.getLatestCommitHash();
    Logger.info(`Using commit: ${this.commitHash}`);
    
    this.allFiles = RESOURCES.ciphers.flatMap(cipher => 
      RESOURCES.files.map(file => `snarkjs/${cipher}/${file}`)
    );
    
    for (const dir of TARGET_DIRS) {
      await FileSystem.ensureDirectory(dir);
    }
  }

  async checkExistingFiles() {
    Logger.info('Checking for existing files...');
    
    for (const file of this.allFiles) {
      let found = false;
      for (const dir of TARGET_DIRS) {
        if (await FileSystem.fileExists(path.join(dir, file))) {
          found = true;
          break;
        }
      }
      if (!found) {
        Logger.info(`Missing file: ${file}`);
        return false;
      }
    }
    
    return true;
  }

  async downloadResources() {
    Logger.info('Preparing download environment...');
    
    await FileSystem.cleanDirectory(TEMP_DIR);
    await FileSystem.ensureDirectory(TEMP_DIR);
    
    const downloader = new DownloadManager(this.commitHash);
    
    Logger.info('Fetching file metadata...');
    const fileSizes = {};
    let totalSize = 0;
    
    for (const filePath of this.allFiles) {
      try {
        const size = await downloader.getFileSize(filePath);
        fileSizes[filePath] = size;
        totalSize += size;
      } catch (error) {
        Logger.error(`Failed to get size for ${filePath}: ${error.message}`);
        fileSizes[filePath] = 0;
      }
    }
    
    Logger.info(`Total download size: ${ProgressReporter.formatBytes(totalSize)}`);
    Logger.info('Downloading files...');
    
    let completedFiles = 0;
    let downloadedBytes = 0;
    const startTime = Date.now();
    
    // Hide cursor (cross-platform)
    const supportsAnsi = process.stdout.isTTY && process.platform !== 'win32';
    if (supportsAnsi) {
      process.stdout.write('\x1B[?25l');
    }
    
    for (const filePath of this.allFiles) {
      const targetPath = path.join(TEMP_DIR, filePath);
      
      await downloader.downloadFile(filePath, targetPath, (delta) => {
        downloadedBytes += delta;
        const elapsed = (Date.now() - startTime) / 1000;
        const speed = elapsed > 0 ? downloadedBytes / elapsed : 0;
        
        Logger.progress(ProgressReporter.renderProgress(
          completedFiles,
          this.allFiles.length,
          downloadedBytes,
          totalSize,
          speed,
          path.basename(filePath)
        ));
      });
      
      completedFiles++;
    }
    
    // Show cursor (cross-platform)
    if (supportsAnsi) {
      process.stdout.write('\x1B[?25h');
    }
    process.stdout.write('\n');
    Logger.info('Downloads completed.');
  }

  async deployResources() {
    Logger.info('Moving files to target directories...');
    
    for (const dir of TARGET_DIRS) {
      try {
        await FileSystem.ensureDirectory(path.dirname(dir));
        
        // Clean existing resources - using manual recursion for Node.js 18.0+ compatibility
        async function getAllFiles(dir, basePath = '') {
          const files = [];
          const entries = await fs.promises.readdir(dir, { withFileTypes: true });
          for (const entry of entries) {
            const relativePath = path.join(basePath, entry.name);
            if (entry.isDirectory()) {
              const subFiles = await getAllFiles(path.join(dir, entry.name), relativePath);
              files.push(...subFiles);
            } else {
              files.push(relativePath);
            }
          }
          return files;
        }
        
        const tempContents = await getAllFiles(TEMP_DIR);
        for (const item of tempContents) {
          const targetPath = path.join(dir, item);
          try {
            const stat = await fs.promises.stat(targetPath);
            if (stat.isDirectory()) {
              await FileSystem.cleanDirectory(targetPath);
            } else {
              await fs.promises.unlink(targetPath);
            }
          } catch {
            // File doesn't exist, continue
          }
        }
        
        await FileSystem.copyDirectory(TEMP_DIR, dir);
        Logger.info(`Files moved to: ${dir}`);
      } catch (error) {
        Logger.error(`Failed to deploy to ${dir}: ${error.message}`);
      }
    }
  }

  async cleanup() {
    Logger.info('Cleaning up temporary files...');
    await FileSystem.cleanDirectory(TEMP_DIR);
  }

  async handleError(error) {
    // Ensure cursor is visible (cross-platform)
    const supportsAnsiEscape = process.stdout.isTTY && process.platform !== 'win32';
    if (supportsAnsiEscape) {
      process.stdout.write('\x1B[?25h');
    }
    process.stdout.write('\n');
    Logger.error('Fatal error occurred', error);
    
    try {
      await FileSystem.cleanDirectory(TEMP_DIR);
    } catch (cleanupError) {
      Logger.error('Failed to clean up temporary directory', cleanupError);
    }
    
    process.exit(1);
  }
}

// Process error handlers
process.on('unhandledRejection', (error) => {
  Logger.error('Unhandled promise rejection', error);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  Logger.error('Uncaught exception', error);
  process.exit(1);
});

// Entry point
(async () => {
  const downloader = new ZkResourceDownloader();
  await downloader.run();
})().catch(error => {
  Logger.error('Unexpected error in main', error);
  process.exit(1);
});