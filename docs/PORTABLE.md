# Windows 便携版

成品：`release/Undead-Tower-0.4.0-portable-x64.exe`。面向 Windows 10/11 x64，已同步 2026-09-04 当前游戏源码：直线追击与拥挤避让、固定困难与最快镜头跟随、清晰防线与突破者标记、护甲脱落与受击声、个人纪录提示、音量调节、死亡低吼与低音量 BGM，以及 0.775 秒快速换弹、减少遮挡的持枪姿态、左手与独立弹匣换弹动作。

后续新增的无手部悬浮枪械仅在源码/网页版生效，当前 0.4.0 EXE 仍显示手部。

旧的 0.3.0 EXE 保留作历史版本，请运行文件名带 0.4.0 的新版。后续默认只修改源码和网页版，用户明确要求后才重新打包。

## 使用

将 EXE 放在可写入的文件夹，双击启动。无需安装 Node.js、Chrome 或额外运行本地服务器；场景、字体、音效和桌面运行环境均已打包，可以离线游玩。首次启动会解压内置运行环境到 Windows 临时目录，可能需要稍等片刻。关闭游戏窗口即可退出。

鼠标瞄准，左键开火，R 换弹，Esc 暂停，M 静音。右上角按钮切换全屏，也支持 F11；窗口关闭按钮或 Alt+F4 退出。

EXE 旁会自动创建 `Undead Tower Data` 文件夹，保存便携版排行榜、音量偏好和运行缓存。更换目录或电脑时，将 **EXE 和这个数据文件夹一起拷贝**。只拷贝 EXE 也能启动，但目标位置将创建新纪录。将新版 EXE 放在旧版同一目录可继续使用既有数据；只显示困难排行榜，旧的简单/普通成绩不会被删除。它与 Chrome/Edge 网页版的排行榜独立，不会自动读取或更改网页成绩。

本次成品未做 Authenticode 代码签名，不需要管理员权限。无需 `win-unpacked` 文件夹即可分发；不要将本机数据目录混入发给其他玩家的空白游戏包。

## 重新打包

在项目目录执行：

```powershell
npm ci
npm run dist:portable
```

首次构建需要联网准备依赖与打包工具。`install:runtime` 调用 Electron 官方安装器，并校验官方 npm 包附带的哈希；运行环境已经安装时直接复用。`electron-builder.cjs` 使用该运行环境生成 x64 单文件 portable，禁止自动发布。产物放在 `release/`，不提交二进制到 Git。

```powershell
npm run desktop        # 从本地生产构建启动桌面窗口
npm run test:portable   # 测试实际 release 下的 portable EXE
```

成品测试在 `test-results/portable-时间戳/` 中创建独立副本和空白数据，单窗口验证离线加载、开火、换弹、暂停、全屏、护甲刷新、自然失败、保存和搬迁后重启读取成绩。测试不会把成绩写入交付 EXE 旁。调试端口仅由测试命令临时指定；普通双击启动不打开调试端口。截图和结果 JSON 保存在本次测试目录。

## 桌面实现

入口为 `desktop/main.cjs`。通过私有 `undead://game/` 协议读取包内 `dist` 文件，没有 HTTP 服务或端口依赖。页面启用沙箱、上下文隔离和内容安全策略，不开放 Node API；禁止跳转到外部页面和弹出新窗口。保留原有渲染上限、暂停和后台冻结机制，重复启动会聚焦现有游戏窗口。

便携数据路径采用启动器提供的 `PORTABLE_EXECUTABLE_DIR`，不会保存到每次解压的临时程序目录。相关接口见 [Electron 协议文档](https://www.electronjs.org/docs/latest/api/protocol) 和 [electron-builder 便携版文档](https://www.electron.build/nsis/)。
