// Regenerates src/tee-manifest.ts from a tee-libs GitHub Release's SHA256SUMS.
//
//   node tools/sync-tee-manifest.js tee-libs-e313ebf
//   node tools/sync-tee-manifest.js --dir <folder with libreclaim-* files> --base-url <url> --commit <sha>   (local testing)
const { createHash } = require('crypto');
const fs = require('fs');
const path = require('path');

const REPO = 'reclaimprotocol/zk-fetch';
const MANIFEST = path.join(__dirname, '..', 'src', 'tee-manifest.ts');
const NAME = /^libreclaim-(.+)\.(so|dylib|dll)$/;

function arg(name) {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
}

async function fromRelease(tag) {
  const baseUrl = `https://github.com/${REPO}/releases/download/${tag}`;
  const response = await fetch(`${baseUrl}/SHA256SUMS`);
  if (!response.ok) {
    throw new Error(`GET ${baseUrl}/SHA256SUMS: HTTP ${response.status}`);
  }
  const sums = (await response.text()).trim().split('\n').map((line) => {
    const [sha256, file] = line.trim().split(/\s+/);
    return { sha256, file: file.replace(/^\*/, '') };
  });
  const notes = await fetch(`https://api.github.com/repos/${REPO}/releases/tags/${tag}`).then((r) => r.json());
  const commit = (/@([0-9a-f]{40})/.exec(notes.body || '') || [])[1] || '';
  return { tag, reclaimTeeCommit: commit, baseUrl, sums };
}

function fromDir(dir, baseUrl, commit) {
  const sums = fs.readdirSync(dir).filter((f) => NAME.test(f)).map((file) => ({
    file,
    sha256: createHash('sha256').update(fs.readFileSync(path.join(dir, file))).digest('hex'),
  }));
  return { tag: 'local', reclaimTeeCommit: commit || '', baseUrl, sums };
}

async function main() {
  const dir = arg('--dir');
  if (!dir && !process.argv[2]) {
    throw new Error('usage: node tools/sync-tee-manifest.js <release tag>');
  }
  const data = dir ? fromDir(dir, arg('--base-url'), arg('--commit')) : await fromRelease(process.argv[2]);

  const files = {};
  for (const { file, sha256 } of data.sums) {
    const match = NAME.exec(file);
    if (match && /^[0-9a-f]{64}$/.test(sha256)) {
      files[match[1]] = { file, sha256 };
    }
  }
  if (!Object.keys(files).length) {
    throw new Error('no libreclaim-* files found');
  }

  const manifest = { tag: data.tag, reclaimTeeCommit: data.reclaimTeeCommit, baseUrl: data.baseUrl, files };
  const source = fs.readFileSync(MANIFEST, 'utf8');
  const updated = source.replace(/= \{[\s\S]*\};\s*$/, `= ${JSON.stringify(manifest, null, 2)};\n`);
  fs.writeFileSync(MANIFEST, updated);
  console.log(`Updated ${path.relative(process.cwd(), MANIFEST)}: ${Object.keys(files).join(', ')}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
