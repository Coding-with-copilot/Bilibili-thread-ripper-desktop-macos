"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const { Asar } = require("../tools/asar.cjs");
const { buildBundle, buildPreload, patchArchive } = require("../tools/mac-port.cjs");

function emptyArchive() {
  const json = Buffer.from('{"files":{}}'), padded = Math.ceil((json.length + 4) / 4) * 4;
  const bytes = Buffer.alloc(padded + 12);
  bytes.writeUInt32LE(4, 0); bytes.writeUInt32LE(padded + 4, 4);
  bytes.writeUInt32LE(padded, 8); bytes.writeUInt32LE(json.length, 12); json.copy(bytes, 16);
  return new Asar(bytes);
}

test("Mac package preserves the client entry and contains no Windows updater", () => {
  const original = emptyArchive();
  original.set("package.json", JSON.stringify({ name: "bilibili", version: "1.19.0" }));
  original.set("index.js", '"use strict";\nstartClient();');
  original.set("render/player.html", "<html>player</html>");
  const bundle = buildBundle(), result = patchArchive(original.pack(), bundle);
  const patched = new Asar(result.bytes);
  assert.equal(result.clientVersion, "1.19.0");
  assert.match(patched.text("index.js"), /^"use strict";\ntry\{require\("\.\/btr-desktop\/bootstrap\.cjs"\)\}/);
  assert.match(patched.text("index.js"), /startClient\(\);$/);
  assert.equal(patched.text("render/player.html"), "<html>player</html>");
  assert.equal(patched.text("btr-desktop/desktop.js"), bundle.toString());
  assert.doesNotMatch(bundle.toString(), /\/\* src\/updates\.js \*\//);
  assert.equal(patched.entry("btr-desktop/update-main.cjs"), undefined);
});

test("Mac preload enters only the official player and settings pages", () => {
  const preload = buildPreload(Buffer.from("window.__MAC_TEST__=true;", "utf8")).toString();
  function injected(href, mainFrame = true) {
    const url = new URL(href), scripts = [];
    const document = {
      documentElement: {}, head: { appendChild(script) { scripts.push(script.textContent); } },
      createElement() { return { textContent: "", remove() {} }; }
    };
    vm.runInNewContext(preload, {
      process: { isMainFrame: mainFrame }, location: url, document,
      MutationObserver: class { observe() {} disconnect() {} },
      console: { info() {} }
    });
    return scripts;
  }
  assert.deepEqual(injected("https://bilipc.bilibili.com/player.html"), ["window.__MAC_TEST__=true;"]);
  assert.deepEqual(injected("file:///Applications/哔哩哔哩.app/Contents/Resources/app.asar/render/player.html"), ["window.__MAC_TEST__=true;"]);
  assert.deepEqual(injected("https://bilipc.bilibili.com/index.html"), ["window.__MAC_TEST__=true;"]);
  assert.deepEqual(injected("https://other.example/player.html"), []);
  assert.deepEqual(injected("file:///Users/test/player.html"), []);
  assert.deepEqual(injected("https://bilipc.bilibili.com/player.html", false), []);
});
