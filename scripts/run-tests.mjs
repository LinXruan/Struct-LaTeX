import esbuild from "esbuild";
import { rmSync, mkdirSync } from "fs";
import { spawnSync } from "child_process";

const outFile = ".tmp/structuralDelete.test.mjs";
mkdirSync(".tmp", { recursive: true });

try {
  await esbuild.build({
    entryPoints: ["tests/parser/structuralDelete.test.ts"],
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
    outfile: outFile,
  });

  const result = spawnSync(process.execPath, ["--test", outFile], {
    stdio: "inherit",
  });
  process.exitCode = result.status ?? 1;
} finally {
  rmSync(".tmp", { recursive: true, force: true });
}
