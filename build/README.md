# 构建资源（electron-builder `buildResources`）

`electron-builder.yml` 引用本目录：

```yaml
directories:
  buildResources: build
win:
  icon: build/icon.ico
```

## 当前状态（ICON-01，2026-11-01）

**图标已就位。** 本目录现有：

| 文件 | 说明 |
| --- | --- |
| `icon.ico` | 84,238 B，8 尺寸：16/20/24/32/48/64（BMP）+ 128/256（PNG），32bpp 带 alpha |
| `icon.png` | 1024×1024 RGBA 主设计稿（生成器输出） |
| `icon-512.png` | 512×512 预览版 |
| `icon-draft-original.jpg` | **负责人提供的初稿原件**，只读保留，未参与打包 |

生成与校验脚本在 `.cache/icon-gen/`（不进入打包，`files` 只收 `out/**`）：
`make_icon.py` 是唯一真源（几何/配色/光学尺寸策略），`verify_ico.py` 是独立 ICO 解析校验器。

小尺寸策略：16/20/24 使用"格线 + 齿轮"的简化变体（3×3 单元格在 16px 会糊成一团），
32 起使用单元格变体，128 起加外发光与轮缘。详见 `docs/ICON-01-应用图标与REL-ICON核验.md`。

## 仍需验证

- `win.icon: build/icon.ico` 的解析已按 electron-builder 25.1.8 源码确认：
  先试 `build/build/icon.ico`（不存在），再回退 `projectDir/build/icon.ico`（存在）→ 可用。
  更直接的写法是 `icon: icon.ico`（命中 buildResources 资源列表），**本轮未改**。
- **打包尚未执行**，因此 `REL-ICON` 仍未关闭；关闭条件 = 多尺寸 ICO（已完成）+ `dist:win` 无 icon 告警（待验证）。

## 后续（mac 目标才需要）

| 文件 | 规格 |
| --- | --- |
| `icon.icns` | 1024×1024 源图导出，含 16–512@2x |

## 验证命令

```bash
# 只做配置检查，不产出安装包
node -e "const s=require('fs').statSync('build/icon.ico');console.log('icon bytes',s.size)"
# 正式打包（需项目负责人批准后执行）
npm run dist:win
```
