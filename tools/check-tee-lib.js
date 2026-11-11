// Loads a libreclaim build through koffi (the way zk-fetch does) and calls an
// exported function. Usage: node tools/check-tee-lib.js <path-to-libreclaim>
const koffi = require('koffi');

const libPath = process.argv[2];
if (!libPath) {
  console.error('usage: node tools/check-tee-lib.js <path-to-libreclaim>');
  process.exit(2);
}

const lib = koffi.load(libPath);
for (const name of ['reclaim_execute_protocol', 'reclaim_free_string', 'reclaim_get_error_message', 'reclaim_get_version', 'InitAlgorithm']) {
  // lib.func throws if the symbol isn't exported.
  lib.func(name, 'void', []);
}
const getVersion = lib.func('reclaim_get_version', 'str', []);
console.log(`ok: loaded ${libPath}, all exports present, version ${getVersion()}`);
