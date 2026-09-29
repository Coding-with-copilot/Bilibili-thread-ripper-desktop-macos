# BTR Desktop for macOS（预览版）

将 Bilibili 线程撕裂者的多连接媒体下载接入哔哩哔哩官方 Mac 客户端。BTR 保留客户端原有的播放器、弹幕、字幕和操作方式，只尝试接管符合条件的点播视频分段请求；直播和离线下载不在本移植版范围内。

这是基于 [BTR Windows 桌面版](https://github.com/MrTangLuyao/Bilibili-thread-ripper-desktop) 的 **macOS 移植预览版**，不是官方哔哩哔哩客户端，也不是已经完成性能验证的正式版。

## 当前状态

预览版版本：`2026.9.29.1-d1-mac-preview.2`。目前在官方 Mac 客户端 **1.19.0** 上确认：应用副本可启动、正常播放，客户端设置和播放器齿轮中能看到 BTR 选项。登录尚未测试；**实际视频下载是否已由 BTR 接管仍待诊断计数确认**。播放成功或看见 BTR 设置，并不能单独证明加速生效。

## 下载与使用

1. 从 [GitHub Release 下载 Mac 预览版 ZIP](https://github.com/Coding-with-copilot/Bilibili-thread-ripper-desktop-macos/releases/download/preview/BTR-Mac-Preview-2026.9.29.1-d1-mac-preview.2-App.zip)，解压得到 `哔哩哔哩-BTR-diagnostic.app`。
2. 将应用放到本机目录，例如 `~/Applications`。先完全退出正在运行的官方哔哩哔哩客户端，再打开这个测试副本。
3. 播放一个普通视频并拖动进度条，然后打开播放器齿轮菜单，查看 BTR 下方的 **“诊断”** 一行。`接管`次数大于 0，表示已有媒体请求经过 BTR 下载并交回播放器。若仍为 0，请记录“媒体 fetch/XHR”“页面资源”和“最近跳过”的完整文字。

预览包使用本地临时签名，没有 Apple 开发者签名或公证；首次打开时可能受到 macOS 的应用安全检查。它与原版客户端使用同一份用户数据，测试时请勿同时运行两个客户端实例。BTR 的成功提示默认隐藏，需在设置中打开 **Debug 模式** 才会显示“视频数据已交给客户端”；没看到这条提示不能作为加速未生效的依据。

更完整的安装、诊断和源码构建步骤见 [Mac 预览版说明](docs/mac-preview.md)。

## 从源码生成自己的应用副本

准备好官方 `哔哩哔哩.app` 和 Node.js，在仓库根目录执行：

```sh
node tools/mac-port.cjs install '/Applications/哔哩哔哩.app' "$HOME/Applications/哔哩哔哩-BTR.app"
```

输出路径必须尚不存在。脚本会复制官方应用，仅修改新副本，并更新 Electron 的 ASAR 完整性记录和本地签名；原版应用保持不变。Mac 移植版不检查或安装 BTR 更新。官方客户端升级后，需要从新版本的原版应用重新生成副本并重新验证兼容性。

## 设置与实现

- CDN 可选大陆、海外或自定义；自定义地址只接受 B 站视频服务器。
- 默认开启自动并发：平时从 8 条连接起步，新视频开头先用 16 条，按播放和下载表现于 8 至 32 条之间调整。关闭自动模式后，可手动选 4、8、16、32、64 或 128。
- 加速请求失败时，会将该请求交回客户端原有下载流程。实际效果仍受网络线路、CDN 和资源本身影响。

`shared/` 是复用的下载核心；`src/transport.js` 接管媒体 `fetch`／XHR，`src/client.js` 连接客户端播放器，`src/bootstrap-mac.cjs` 和 `tools/mac-port.cjs` 负责 Mac 版注入及封装。运行相关测试：

```sh
node --test test/mac-port.test.cjs test/transport.test.cjs test/auto-concurrency.test.cjs
```

发现问题时，请附上官方客户端版本、播放器齿轮中的完整诊断文字，以及开启 Debug 模式后出现的错误提示；不要提交带签名参数的完整视频地址。

本项目采用 [MIT 许可证](LICENSE)。
