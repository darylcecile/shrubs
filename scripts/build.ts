import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("..", import.meta.url));
const distDir = join(rootDir, "dist");

rmSync(distDir, { recursive: true, force: true });
mkdirSync(distDir, { recursive: true });

const pkgJson = JSON.parse(await Bun.file(join(rootDir, "package.json")).text());
const external = new Set<string>([
  ...Object.keys(pkgJson.devDependencies ?? {}),
  ...Object.keys(pkgJson.peerDependencies ?? {}),
]);

["sury", "@valibot/to-json-schema", "effect"].forEach((name) => external.add(name));

const entrypoints = [
	join(rootDir, "src", "index.ts"), 
	join(rootDir, "src", "fs", "index.ts"),
	join(rootDir, "src", "util", "index.ts"),

	// Adapters
	join(rootDir, "src", "adapters", "github.ts"),
];

const buildResult = await Bun.build({
  entrypoints,
  outdir: distDir,
  format: "esm",
  target: "node",
  sourcemap: "external",
  splitting: false,
  external: Array.from(external),
});

if (!buildResult.success) {
  console.error("❌ JS build failed");
  for (const log of buildResult.logs) {
    console.error(log.message);
  }
  process.exit(1);
}

console.log(`✅ JS build complete (${buildResult.outputs.length} file(s))`);

const tsc = Bun.spawn({
  cmd: ["bunx", "tsc", "--project", join(rootDir, "tsconfig.build.json")],
  stdout: "inherit",
  stderr: "inherit",
});

const tscExitCode = await tsc.exited;

if (tscExitCode !== 0) {
  console.error("❌ Type declaration build failed");
  process.exit(tscExitCode);
}

console.log("✅ Type declarations generated");
