const path = require("node:path");
const fs = require("node:fs");
const { execSync } = require("node:child_process");

const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, "dist");

for (const target of ["chrome", "firefox"]) {
  const targetDir = path.join(distDir, target);
  if (!fs.existsSync(targetDir)) {
    continue;
  }
  const zipPath = path.join(distDir, `rolling-vine-${target}.zip`);
  if (fs.existsSync(zipPath)) {
    fs.rmSync(zipPath);
  }
  execSync(`cd "${targetDir}" && zip -r "${zipPath}" .`, { stdio: "inherit" });
  console.log(`Created ${zipPath}`);
}
