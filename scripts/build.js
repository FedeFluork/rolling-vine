const fs = require("node:fs");
const path = require("node:path");

const mode = process.argv[2] || "all";
const rootDir = path.resolve(__dirname, "..");
const srcDir = path.join(rootDir, "src");
const distDir = path.join(rootDir, "dist");

function copyRecursive(source, target) {
  fs.mkdirSync(target, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    if (entry.name === ".DS_Store") {
      continue;
    }

    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);
    if (entry.isDirectory()) {
      copyRecursive(sourcePath, targetPath);
    } else {
      fs.copyFileSync(sourcePath, targetPath);
    }
  }
}

function buildTarget(target) {
  const targetDir = path.join(distDir, target);
  fs.rmSync(targetDir, { recursive: true, force: true });
  copyRecursive(srcDir, targetDir);

  const manifestPath = path.join(targetDir, "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

  if (target === "chrome") {
    // Chrome ignores gecko settings, but removing them keeps output minimal.
    delete manifest.browser_specific_settings;
  }

  if (target === "firefox") {
    manifest.browser_specific_settings = manifest.browser_specific_settings || {
      "gecko": {
        "id": "rolling-vine@fedefluork.dev",
        "strict_min_version": "140.0",
        "data_collection_permissions": {
          "required": [
            "none"
          ],
          "optional": []
        }
      },
      "gecko_android": {
        "strict_min_version": "142.0"
      }
    };

    manifest.background = manifest.background || {};
    delete manifest.background.service_worker;
    manifest.background.scripts = [
      "shared/core.js",
      "shared/storage.js",
      "background/service-worker.js"
    ];
  }

  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(`Built ${target} package in ${targetDir}`);
}

fs.mkdirSync(distDir, { recursive: true });

if (mode === "all") {
  buildTarget("chrome");
  buildTarget("firefox");
} else if (mode === "chrome" || mode === "firefox") {
  buildTarget(mode);
} else {
  console.error("Usage: node scripts/build.js [all|chrome|firefox]");
  process.exit(1);
}
