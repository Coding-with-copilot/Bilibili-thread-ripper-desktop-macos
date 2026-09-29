"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { Asar, sha } = require("./asar.cjs");

const project = path.resolve(__dirname, "..");
const config = JSON.parse(fs.readFileSync(path.join(project, "desktop.json"), "utf8"));
const files = [
  ...["range-core.js", "cdn-resolver.js", "idm-downloader.js", "runtime-notices.js", "notification-view.js"].map(name => `shared/${name}`),
  ...["settings.js", "transport.js", "client.js", "settings-view.js", "player-settings.js"].map(name => `src/${name}`)
];
const version = `${config.version}-mac-preview.2`;

function buildBundle() {
  return Buffer.from(`globalThis.__BTR_DESKTOP_RELEASE__=${JSON.stringify({ version, adapterRevision: config.adapterRevision })};\n` +
    files.map(file => `\n/* ${file} */\n${fs.readFileSync(path.join(project, file), "utf8")}\n`).join(""));
}

function buildPreload(bundle) {
  // The file URL case covers clients that load HTML directly from app.asar. All other
  // origins are ignored because this preload is attached to the whole Electron session.
  return Buffer.from(`"use strict";\n(() => {\n` +
    `if (!process.isMainFrame) return;\n` +
    `let page; try { page = decodeURIComponent(location.pathname); } catch (_) { return; }\n` +
    `const official = location.origin === "https://bilipc.bilibili.com" && /^\\/(?:index|player)\\.html$/.test(page);\n` +
    `const local = location.protocol === "file:" && /\\/app\\.asar\\/render\\/(?:index|player)\\.html$/.test(page);\n` +
    `if (!official && !local) return;\n` +
    `const code = ${JSON.stringify(bundle.toString("utf8"))};\n` +
    `let injected = false;\n` +
    `function inject() { if (injected || !document.documentElement) return; injected = true; observer.disconnect(); const script = document.createElement("script"); script.textContent = code; (document.head || document.documentElement).appendChild(script); script.remove(); console.info("BTR Mac preview: page adapter injected"); }\n` +
    `const observer = new MutationObserver(inject); observer.observe(document, { childList: true, subtree: true }); inject();\n` +
    `})();\n`);
}

function patchArchive(originalBytes, bundle) {
  const archive = new Asar(originalBytes);
  const pkg = JSON.parse(archive.text("package.json"));
  if (pkg.name !== "bilibili") throw Error("目标不是哔哩哔哩客户端");
  const entry = String(pkg.main || "index.js").replace(/^\.\//, "");
  if (!/^(?:[\w.-]+\/)*[\w.-]+\.c?js$/.test(entry) || !archive.entry(entry) || archive.entry(entry).files || archive.entry(entry).unpacked) {
    throw Error("无法识别客户端的 JavaScript 主入口");
  }
  if (!archive.entry("render/player.html")) throw Error("找不到客户端播放页面");
  const source = archive.text(entry);
  if (source.includes("btr-desktop/bootstrap.cjs")) throw Error("此客户端已经接入 BTR，请使用未修改的原版应用");
  const relative = path.posix.relative(path.posix.dirname(entry), "btr-desktop/bootstrap.cjs");
  const requirePath = relative.startsWith(".") ? relative : `./${relative}`;
  const head = /^\uFEFF?(?:\s*(["'])use strict\1[ \t]*;?[ \t]*(?:\r?\n)?)?/.exec(source)[0];
  const prefix = `try{require(${JSON.stringify(requirePath)})}catch(error){console.error("BTR Mac bootstrap:",error)}\n`;
  archive.set(entry, head + prefix + source.slice(head.length));
  archive.set("btr-desktop/bootstrap.cjs", fs.readFileSync(path.join(project, "src/bootstrap-mac.cjs")));
  archive.set("btr-desktop/preload.cjs", buildPreload(bundle));
  archive.set("btr-desktop/desktop.js", bundle);
  archive.set("btr-desktop/mac.json", JSON.stringify({ version, clientVersion: pkg.version, bundleSha256: sha(bundle) }));
  const bytes = archive.pack();
  const check = new Asar(bytes);
  if (check.text(entry) !== head + prefix + source.slice(head.length) || sha(check.read("btr-desktop/desktop.js")) !== sha(bundle)) {
    throw Error("封装校验失败");
  }
  return { bytes, clientVersion: pkg.version, entry };
}

function plistHash(plist) {
  return execFileSync("/usr/libexec/PlistBuddy", ["-c", "Print :ElectronAsarIntegrity:Resources/app.asar:hash", plist], { encoding: "utf8" }).trim();
}

function setPlistHash(plist, hash) {
  execFileSync("/usr/libexec/PlistBuddy", ["-c", `Set :ElectronAsarIntegrity:Resources/app.asar:hash ${hash}`, plist]);
  if (plistHash(plist) !== hash) throw Error(`ASAR 完整性记录写入失败：${plist}`);
}

function install(source, output) {
  if (process.platform !== "darwin") throw Error("Mac 安装命令只能在 macOS 上运行");
  source = path.resolve(source);
  output = path.resolve(output);
  if (source === output) throw Error("输出必须是新应用，不能覆盖原版");
  if (fs.existsSync(output)) throw Error(`输出已存在：${output}。请指定一个新的输出路径`);
  const original = path.join(source, "Contents/Resources/app.asar");
  const mainPlist = path.join(source, "Contents/Info.plist");
  const frameworkPlist = path.join(source, "Contents/Frameworks/Electron Framework.framework/Versions/A/Resources/Info.plist");
  for (const file of [original, mainPlist, frameworkPlist]) if (!fs.existsSync(file)) throw Error(`找不到应用文件：${file}`);
  const bundle = buildBundle();
  const patched = patchArchive(fs.readFileSync(original), bundle);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  execFileSync("/usr/bin/ditto", ["--noextattr", source, output], { stdio: "inherit" });
  const target = path.join(output, "Contents/Resources/app.asar");
  const temporary = `${target}.btr-tmp`;
  fs.writeFileSync(temporary, patched.bytes, { flag: "wx" });
  fs.renameSync(temporary, target);
  const hash = sha(patched.bytes);
  setPlistHash(path.join(output, "Contents/Info.plist"), hash);
  setPlistHash(path.join(output, "Contents/Frameworks/Electron Framework.framework/Versions/A/Resources/Info.plist"), hash);
  // An ad-hoc signature needs no Apple Developer account. It seals the modified local copy.
  execFileSync("/usr/bin/xattr", ["-cr", output], { stdio: "inherit" });
  execFileSync("/usr/bin/codesign", ["--force", "--deep", "--sign", "-", output], { stdio: "inherit" });
  execFileSync("/usr/bin/codesign", ["--verify", "--deep", "--strict", output], { stdio: "inherit" });
  if (sha(fs.readFileSync(target)) !== hash) throw Error("输出应用的 ASAR 校验失败");
  return { output, clientVersion: patched.clientVersion, version, entry: patched.entry, asarSha256: hash };
}

if (require.main === module) {
  try {
    const action = process.argv[2] || "install";
    if (action === "build") {
      const output = path.join(project, "dist/mac-desktop.js");
      fs.mkdirSync(path.dirname(output), { recursive: true });
      fs.writeFileSync(output, buildBundle());
      console.log(output);
    } else if (action === "install") {
      const source = process.argv[3] || path.resolve(project, "../哔哩哔哩.app");
      const output = process.argv[4] || "/private/tmp/哔哩哔哩-BTR.app";
      console.log(JSON.stringify(install(source, output), null, 2));
    } else throw Error("用法：mac-port.cjs [build|install [原版.app] [新应用.app]]");
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}

module.exports = { buildBundle, buildPreload, patchArchive, install };
