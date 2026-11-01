# 第三方组件与资料

Shiori 程序代码采用 MIT 许可。以下组件与资料各自保留原许可：

- Electron：MIT；发布包保留 `ELECTRON-LICENSE.txt` / `LICENSES.chromium.html` 等运行时许可文件。
- opencc-js：MIT；发布包的 `resources/app/node_modules/opencc-js` 保留其许可文件。
- Playwright：Apache-2.0，仅用于开发测试，不包含在应用发布包中。
- electron-builder：MIT，用于开发构建。Windows 安装程序使用 NSIS，遵循其 zlib/libpng 许可及相关组件许可，见 https://nsis.sourceforge.io/License 。
- Bangumi、VNDB 和 2DFan 的资料、图片及游戏内容不属于本项目的 MIT 许可范围。发布包不预装这些平台的游戏库、封面或用户资料。使用各平台应遵守其规则与数据许可。

`src/compat/legacy-registry-x86.dll` 是本项目 `src/legacy-registry.c` 编译的 Windows x86 兼容组件。它只处理特定老游戏的用户安装路径，不包含游戏代码或资源。可使用 Tiny C Compiler 0.9.27 重新构建：

```powershell
tcc -shared -o src/compat/legacy-registry-x86.dll src/legacy-registry.c -ladvapi32
```

Tiny C Compiler 是独立的开发工具，不随应用分发。

- MiSans：小米科技有限责任公司，采用 MiSans 字体知识产权许可协议，允许免费商用及应用嵌入。界面使用随程序附带的官方原版字体；字体许可不属于本项目的 MIT 许可。完整协议见 `public/fonts/MiSans-LICENSE.pdf`，来源及校验值见 `public/fonts/README.md`。
- Noto Sans SC：SIL Open Font License 1.1。作为 MiSans 未覆盖字符的后备字体随程序附带，完整许可证和来源记录保存在 public/fonts/，不需要联网或在系统安装字体。

- 得意黑 Smiley Sans：Copyright (c) 2022–2024, atelierAnchor，采用 SIL Open Font License 1.1。随应用附带官方原版字体，用于大标题；完整许可见 `public/fonts/OFL-SmileySans.txt`。
