import esbuild from "esbuild";
import { readdirSync, rmSync, mkdirSync, statSync } from "fs";
import { join, basename } from "path";
import { spawnSync } from "child_process";

function collectTestFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...collectTestFiles(full));
    } else if (entry.endsWith(".test.ts")) {
      files.push(full);
    }
  }
  return files;
}

const testEntries = collectTestFiles("tests");
mkdirSync(".tmp", { recursive: true });

try {
  const outFiles = [];
  for (const entry of testEntries) {
    const outFile = join(".tmp", basename(entry).replace(/\.ts$/, ".mjs"));
    await esbuild.build({
      entryPoints: [entry],
      bundle: true,
      platform: "node",
      format: "esm",
      target: "node20",
      outfile: outFile,
    });
    outFiles.push(outFile);
  }

  const result = spawnSync(process.execPath, ["--test", ...outFiles], {
    stdio: "inherit",
  });
  process.exitCode = result.status ?? 1;
} finally {
  rmSync(".tmp", { recursive: true, force: true });
}
