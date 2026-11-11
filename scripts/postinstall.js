// Downloads and verifies the TEE library (libreclaim) for this platform during
// `npm install`. It never fails the install: on any problem it prints a warning,
// and zk-fetch downloads the library on the first `useTee: true` request instead.
//
// Skipped when RECLAIM_TEE_SKIP_DOWNLOAD=1 or RECLAIM_TEE_LIB_PATH is set.

const path = require('path');

async function main() {
  if (process.env.RECLAIM_TEE_SKIP_DOWNLOAD === '1' || process.env.RECLAIM_TEE_LIB_PATH) {
    return;
  }

  let teeLibrary;
  try {
    teeLibrary = require(path.join(__dirname, '..', 'dist', 'tee-library.js'));
  } catch {
    // dist/ isn't built (installing inside the zk-fetch repo itself). Nothing to do.
    return;
  }

  try {
    const libPath = await teeLibrary.ensureTeeLibrary();
    console.log(`zk-fetch: TEE library ready (${teeLibrary.getTeePlatformKey()}): ${libPath}`);
  } catch (error) {
    console.warn(
      `zk-fetch: skipped the TEE library download: ${error.message}\n` +
        'zk-fetch: only TEE mode (useTee: true) needs it; it will be downloaded on first use.'
    );
  }
}

main().finally(() => process.exit(0));
