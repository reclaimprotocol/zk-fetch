const fs = require('fs');
const path = require('path');
const https = require('https');

const REPO = "reclaimprotocol/zk-symmetric-crypto";
// Handles both possible node_modules layouts for zk-symmetric-crypto/resources
const TARGET_DIRS = [
    path.join(
        process.cwd(),
        "node_modules",
        "@reclaimprotocol",
        "attestor-core",
        "node_modules",
        "@reclaimprotocol",
        "zk-symmetric-crypto",
        "resources"
    ),
    path.join(
        process.cwd(),
        "node_modules",
        "@reclaimprotocol",
        "zk-symmetric-crypto",
        "resources"
    )
];
const TEMP_DIR = path.join(process.cwd(), "zk-resources");

/**
 * Fetch the latest commit hash from the GitHub repository.
 */
function getLatestCommitHash() {
  return new Promise((resolve, reject) => {
    const url = `https://api.github.com/repos/${REPO}/commits/HEAD`;
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Node.js'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.sha) {
            resolve(json.sha);
          } else {
            reject(new Error('No SHA found in GitHub API response'));
          }
        } catch (error) {
          reject(new Error(`Failed to parse GitHub API response: ${error.message}`));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('Timeout fetching latest commit hash'));
    });
  });
}

/**
 * Perform a HEAD request to fetch the file's content-length.
 * Follows redirects if necessary.
 */
function getFileSize(filePath, commitHash, url = null) {
  if (!url) {
    url = `https://github.com/${REPO}/raw/${commitHash}/resources/${filePath}`;
  }
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method: 'HEAD' }, (res) => {
      if ([301, 302].includes(res.statusCode) && res.headers.location) {
        return resolve(getFileSize(filePath, commitHash, res.headers.location));
      }
      const size = parseInt(res.headers['content-length'], 10);
      resolve(isNaN(size) ? 0 : size);
    });
    req.on('error', reject);
    req.end();
  });
}

/**
 * Download a file from GitHub with retries. On every received chunk,
 * call progressCallback(delta) where delta is the number of bytes just received.
 * Follows redirects if necessary.
 */
async function downloadFile(filePath, targetPath, progressCallback, commitHash, url = null, retries = 3) {
  if (!url) {
    url = `https://github.com/${REPO}/raw/${commitHash}/resources/${filePath}`;
  }
  const dir = path.dirname(targetPath);
  await fs.promises.mkdir(dir, { recursive: true });
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await new Promise((resolve, reject) => {
        const file = fs.createWriteStream(targetPath);
        const request = https.get(url, (response) => {
          if ([301, 302].includes(response.statusCode) && response.headers.location) {
            // Follow redirect
            return downloadFile(filePath, targetPath, progressCallback, commitHash, response.headers.location)
              .then(resolve)
              .catch(reject);
          }
          response.on('data', (chunk) => {
            progressCallback(chunk.length);
          });
          response.pipe(file);
          file.on('finish', () => {
            file.close(resolve);
          });
        });
    
        request.on('error', (err) => {
          fs.unlink(targetPath, () => reject(err));
        });
    
        request.setTimeout(30000, () => {
          request.destroy();
          reject(new Error(`Timeout downloading ${filePath}`));
        });
      });
    } catch (error) {
      if (attempt === retries) {
        throw new Error(`Failed to download ${filePath} after ${retries} attempts: ${error.message}`);
      }
      console.log(`\nRetry ${attempt}/${retries} for ${filePath}: ${error.message}`);
      // Exponential backoff: wait 2^attempt seconds before retrying
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
    }
  }
}

/**
 * Format bytes into a human–readable string.
 */
function formatBytes(n) {
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(1)} ${units[i]}`;
}

/**
 * Render the progress string. We compute:
 * - overall progress = globalDownloaded / globalTotal
 * - speed = globalDownloaded / elapsed time
 * - ETA = remaining bytes / speed
 * Also show the number of files finished.
 */
function renderProgress(completedFiles, totalFiles, globalDownloaded, globalTotal, speed, currentFileName) {
  const progress = Math.min(globalTotal > 0 ? globalDownloaded / globalTotal : 0, 1);
  const barLength = 25;
  const filled = Math.round(progress * barLength);
  const unfilled = Math.max(0, barLength - filled);
  const bar = '█'.repeat(filled) + '░'.repeat(unfilled);
  const remaining = speed > 0 ? Math.max(0, globalTotal - globalDownloaded) / speed : 0;
  
  const percentage = (progress * 100).toFixed(1).padStart(5);
  const spdStr = `${formatBytes(speed)}/s`;
  const etaStr = isFinite(remaining) ? `${Math.round(remaining)}s`.padStart(4) : '--';
  
  
  return `[${completedFiles.toString().padStart(2)}/${totalFiles}] ${percentage}% [${bar}] Speed: ${spdStr} Time Left: ${etaStr} | ${currentFileName}`;
}

async function main() {
  try {
    // Fetch the latest commit hash
    console.log('🔄 Fetching latest commit hash...');
    const COMMIT_HASH = await getLatestCommitHash();
    console.log(`📝 Using commit: ${COMMIT_HASH}`);

    // Create each directory in TARGET_DIRS if it doesn't exist
    for (const dir of TARGET_DIRS) {
      await fs.promises.mkdir(dir, { recursive: true });
    }

    // Check if files already exist in the target directory
    const ciphers = ['chacha20', 'aes-256-ctr', 'aes-128-ctr'];
    const files = ['circuit_final.zkey', 'circuit.wasm', 'circuit.r1cs'];

    const allFiles = [
      ...ciphers.flatMap(c => files.map(f => `snarkjs/${c}/${f}`)),
    ];

    // Check if all files exist
    const allFilesExist = await Promise.all(
      allFiles.map(async (file) => {
        try {
          // Support checking in all TARGET_DIRS for the file (fix for arrays)
          let found = false;
          for (const dir of TARGET_DIRS) {
            try {
              await fs.promises.access(path.join(dir, file));
              found = true;
              break;
            } catch {}
          }
          if (!found) throw new Error(`File not found: ${file}`);
          return true;
        } catch {
          return false;
        }
      })
    ).then(results => results.every(exists => exists));

    if (allFilesExist) {
      console.log('ZK files already exist in target directory, skipping download.');
      process.exit(0);
      return;
    }

    // Create and clean temp directory
    await fs.promises.rm(TEMP_DIR, { recursive: true, force: true });
    await fs.promises.mkdir(TEMP_DIR, { recursive: true });

    console.log('📦 Downloading ZK files ');

    const totalFiles = allFiles.length;
  
    // Pre-fetch each file's size so that we can compute overall progress
    console.log('🔍 Fetching file information... please wait');
    let fileSizes = {};
    let globalTotalBytes = 0;
    for (const filePath of allFiles) {
      try {
        const size = await getFileSize(filePath, COMMIT_HASH);
        fileSizes[filePath] = size;
        globalTotalBytes += size;
      } catch (err) {
        fileSizes[filePath] = 0;
      }
    }
  
    let completedFiles = 0;
    let globalDownloadedBytes = 0;
    const startTime = Date.now();
  
    process.stdout.write('\x1B[?25l'); // Hide cursor
  
    // Download files sequentially to temp directory
    for (const filePath of allFiles) {
      const targetPath = path.join(TEMP_DIR, filePath);
      let currentFileDownloaded = 0;
  
      await downloadFile(filePath, targetPath, (delta) => {
        currentFileDownloaded += delta;
        globalDownloadedBytes += delta;
  
        const elapsed = (Date.now() - startTime) / 1000;
        const speed = elapsed > 0 ? globalDownloadedBytes / elapsed : 0;
  
        const progressStr = renderProgress(
          completedFiles,
          totalFiles,
          globalDownloadedBytes,
          globalTotalBytes,
          speed,
          path.basename(filePath)
        );
        process.stdout.write('\r\x1B[K' + progressStr);
      }, COMMIT_HASH);
      completedFiles++;
  
      // After finishing the file, update the progress one last time.
      const elapsed = (Date.now() - startTime) / 1000;
      const speed = elapsed > 0 ? globalDownloadedBytes / elapsed : 0;
      const progressStr = renderProgress(
        completedFiles,
        totalFiles,
        globalDownloadedBytes,
        globalTotalBytes,
        speed,
        path.basename(filePath)
      );
      process.stdout.write('\r\x1B[K' + progressStr);
    }
  
    process.stdout.write('\x1B[?25h\n'); // Show cursor
    console.log('\nMoving files to final location...');

    // Copy files from temp to final location
    for (const dir of TARGET_DIRS) {
      // Create parent directory if it doesn't exist
      await fs.promises.mkdir(path.dirname(dir), { recursive: true });
      await fs.promises.rm(dir, { recursive: true, force: true });
      
      // Copy the temp directory contents to the target directory
      await fs.promises.cp(TEMP_DIR, dir, { recursive: true });
    }

    // Clean up temp directory
    await fs.promises.rm(TEMP_DIR, { recursive: true, force: true });

    console.log('Download completed successfully!');
    process.exit(0);
  } catch (error) {
    process.stdout.write('\x1B[?25h\n'); // Ensure the cursor is restored
    console.error('\nFatal error during download:', error);
    // Clean up temp directory on error
    await fs.promises.rm(TEMP_DIR, { recursive: true, force: true });
    process.exit(1);
  }
}
  
process.on('unhandledRejection', (error) => {
  console.error('Unhandled promise rejection:', error);
  process.exit(1);
});
  
main();