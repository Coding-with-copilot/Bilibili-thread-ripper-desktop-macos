"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { sha } = require("./asar.cjs");

const project = path.resolve(__dirname, "..");
const root = path.resolve(project, "..");
const release = JSON.parse(fs.readFileSync(path.join(project, "desktop.json"), "utf8"));
const label = `BTR-Mac-Preview-${release.version}-mac-preview.2`;
const files = [
  "LICENSE", "desktop.json", "docs/mac-preview.md",
  ...["range-core.js", "cdn-resolver.js", "idm-downloader.js", "runtime-notices.js", "notification-view.js"].map(name => `shared/${name}`),
  ...["bootstrap-mac.cjs", "settings.js", "transport.js", "client.js", "settings-view.js", "player-settings.js"].map(name => `src/${name}`),
  ...["asar.cjs", "mac-port.cjs", "package-mac.cjs"].map(name => `tools/${name}`),
  ...["mac-port.test.cjs", "transport.test.cjs", "auto-concurrency.test.cjs"].map(name => `test/${name}`)
];

function packageMac(appPath = "/private/tmp/哔哩哔哩-BTR-diagnostic.app", outDir = path.join(root, "deliverables")) {
  appPath = path.resolve(appPath); outDir = path.resolve(outDir);
  if (!fs.existsSync(path.join(appPath, "Contents/Resources/app.asar"))) throw Error(`找不到测试应用：${appPath}`);
  fs.mkdirSync(outDir, { recursive: true });
  const sourceDir = path.join(outDir, `${label}-Source`);
  const sourceZip = `${sourceDir}.zip`, appZip = path.join(outDir, `${label}-App.zip`);
  for (const output of [sourceDir, sourceZip, appZip]) if (fs.existsSync(output)) throw Error(`输出已存在，未覆盖：${output}`);
  fs.mkdirSync(sourceDir);
  for (const file of files) {
    const target = path.join(sourceDir, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(project, file), target);
  }
  fs.writeFileSync(path.join(sourceDir, "package.json"), JSON.stringify({
    name: "btr-mac-preview", private: true, version: `${release.version}-mac-preview.2`,
    scripts: { build: "node tools/mac-port.cjs build", install: "node tools/mac-port.cjs install", test: "node --test test/*.test.cjs" }
  }, null, 2) + "\n");
  fs.writeFileSync(path.join(sourceDir, "README.md"), `# BTR Mac 预览版源码\n\n本包只含 BTR 移植源码，不含哔哩哔哩客户端。使用方法见 [Mac 预览版说明](docs/mac-preview.md)。\n\n安装 Node.js 后，在此目录执行：\n\n\`\`\`sh\nnode --test test/*.test.cjs\nnode tools/mac-port.cjs install '/绝对路径/哔哩哔哩.app' '/绝对路径/哔哩哔哩-BTR.app'\n\`\`\`\n\n输出路径必须尚不存在。安装脚本会复制原应用，再修改副本。\n`);
  execFileSync("/usr/bin/ditto", ["-c", "-k", "--norsrc", "--noextattr", "--noqtn", "--keepParent", sourceDir, sourceZip], { stdio: "inherit" });
  execFileSync("/usr/bin/ditto", ["-c", "-k", "--norsrc", "--noextattr", "--noqtn", "--keepParent", appPath, appZip], { stdio: "inherit" });
  const manifest = {
    version: `${release.version}-mac-preview.2`,
    appZip: { name: path.basename(appZip), bytes: fs.statSync(appZip).size, sha256: sha(fs.readFileSync(appZip)) },
    sourceZip: { name: path.basename(sourceZip), bytes: fs.statSync(sourceZip).size, sha256: sha(fs.readFileSync(sourceZip)) }
  };
  fs.writeFileSync(path.join(outDir, `${label}-SHA256.json`), JSON.stringify(manifest, null, 2) + "\n");
  return { sourceDir, sourceZip, appZip, manifest };
}

if (require.main === module) {
  try { console.log(JSON.stringify(packageMac(process.argv[2], process.argv[3]), null, 2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}

module.exports = { packageMac };
