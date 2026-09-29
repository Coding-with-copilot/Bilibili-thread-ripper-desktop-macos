"use strict";
// Installed in the Electron main entry before the official app creates its windows.
const { app, session } = require("electron");
const path = require("node:path");
const preload = path.join(__dirname, "preload.cjs");

function attach(target) {
  try {
    const current = target.getPreloads();
    if (!current.includes(preload)) target.setPreloads([...current, preload]);
  } catch (error) { console.error("BTR Mac preload:", error); }
}

app.on("session-created", attach);
app.whenReady().then(() => attach(session.defaultSession)).catch(error => console.error("BTR Mac preload:", error));
