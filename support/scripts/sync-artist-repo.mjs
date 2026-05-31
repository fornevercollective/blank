#!/usr/bin/env node
/**
 * Batch-sync artist repository (album art + tracklists + LRCLIB lyrics).
 *
 *   node support/scripts/sync-artist-repo.mjs --limit 10 --letter A
 *   node support/scripts/sync-artist-repo.mjs --name "Ozzy Osbourne"
 *   BLANK_ARTIST_REPO=~/blank-data/artist-repo node support/scripts/sync-artist-repo.mjs --limit 5
 *
 * Options:
 *   --limit N       Max artists this run (default 5)
 *   --offset N      Skip into filtered list
 *   --letter X      A–Z or # (catalog letter)
 *   --name "Band"   Single artist
 *   --no-lyrics     Albums + covers only (faster)
 *   --skip-synced   Skip artists with profile.json already
 *   --max-albums N  Per artist (default 8)
 *   --reindex       Rebuild index.json from catalog only (no MB/LRCLIB)
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  getRepoRoot,
  loadIndex,
  saveIndex,
  syncBatch,
  repoStatus,
} from "../artist-repo.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function arg(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function has(flag) {
  return process.argv.includes(flag);
}

async function main() {
  if (has("--reindex")) {
    const index = loadIndex();
    saveIndex(index);
    console.log(JSON.stringify(repoStatus(), null, 2));
    return;
  }

  const limit = Number(arg("--limit")) || 5;
  const offset = Number(arg("--offset")) || 0;
  const letter = arg("--letter");
  const name = arg("--name");
  const maxAlbums = Number(arg("--max-albums")) || 8;

  console.log(`Repo root: ${getRepoRoot()}`);

  const batch = await syncBatch({
    names: name ? [name] : undefined,
    letter,
    limit,
    offset,
    maxAlbums,
    fetchLyrics: !has("--no-lyrics"),
    skipSynced: has("--skip-synced"),
    onProgress: ({ i, total, name: n }) => {
      process.stderr.write(`[${i}/${total}] ${n}\n`);
    },
  });

  const ok = batch.results.filter((r) => r.ok && !r.skipped).length;
  const skipped = batch.results.filter((r) => r.skipped).length;
  const fail = batch.results.filter((r) => r.ok === false).length;
  console.log(
    JSON.stringify(
      { ...repoStatus(), run: { processed: batch.processed, ok, skipped, fail } },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
