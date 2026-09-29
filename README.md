# BTR Mac 预览版源码

本包只含 BTR 移植源码，不含哔哩哔哩客户端。使用方法见 [Mac 预览版说明](docs/mac-preview.md)。

安装 Node.js 后，在此目录执行：

```sh
node --test test/*.test.cjs
node tools/mac-port.cjs install '/绝对路径/哔哩哔哩.app' '/绝对路径/哔哩哔哩-BTR.app'
```

输出路径必须尚不存在。安装脚本会复制原应用，再修改副本。
