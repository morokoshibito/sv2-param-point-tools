# SV2 Param Point Tools

Side panel scripts for **Synthesizer V Studio 2 Pro** that let you read and edit points on parameter curves (loudness, tension, breathiness, voicing, gender, pitch deviation, ...) with exact numbers.

[中文说明](#中文说明) · [English](#english)

---

## 中文说明

SV2 的参数曲线只能用鼠标拖动控制点，看不到点的精确位置和数值。这三个侧栏脚本用来做定量编辑。

### 脚本

| 文件 | 侧栏标题 | 用途 |
|---|---|---|
| `SV2_ParamPointEditor.js` | 参数点精确编辑 | 选中一个点，查看并输入它的数值、小节/拍、四分音符、秒；按钮跳到曲线上的前后点 |
| `SV2_ParamPointBatch.js` | 参数点批量调整 | 对同一条曲线上选中的多个点：统一数值、线性/余弦/缓入/缓出过渡、按比例缩放（可设中心）、量化到网格、首尾之间等间距；状态栏显示统计 |
| `SV2_ParamCurveTools.js` | 参数曲线工具 | 播放头处的曲线值与插点、曲线简化、把选中点复制到其他参数或编组 |

三个脚本互相独立，可以只装需要的。

### 安装

1. 需要 Synthesizer V Studio 2 Pro **2.1.2 或更高版本**（侧栏脚本从这个版本开始支持）。
2. 把 `scripts/` 里的 `.js` 文件复制到 SV 的脚本文件夹：
   - Windows：`C:\Users\<用户名>\AppData\Roaming\Dreamtonics\Synthesizer V Studio 2\scripts`
   - macOS：`/Users/<用户名>/Library/Application Support/Dreamtonics/Synthesizer V Studio 2/scripts`
3. 在 SV 里重新扫描脚本，然后在侧栏中启用。

### 界面语言

跟随 SV 的界面语言：简体中文、繁體中文、日本語、English。其他语言显示英文。切换语言后如未生效，请重启 SV。

### 已知限制

这些是 SV 脚本 API 的限制，脚本无法绕过：

- **不能在鼠标悬停时显示坐标**：API 没有鼠标事件。
- **拖动过程中不能实时显示数值**：SV 在松开鼠标前不提供选区和曲线的新数据，所以松开后才更新。
- **插值方式（线性/余弦/样条）是整条参数曲线统一设置的**，脚本无法修改，也不能对某一段单独设置。需要局部直线时，可以用“批量调整 → 过渡 → 按密度生成”加密中间点来近似。
- **撤销（Ctrl+Z）未经验证**：批量操作前建议先保存工程。
- 脚本在 SV 中运行时的效果只在自带的模拟环境里测试过，真实环境请以实际使用为准。

### 许可证

[GNU GPL v3.0](LICENSE)。你可以自由使用、修改和分发；分发修改后的版本时，必须同样以 GPL-3.0 开源。

---

## English

In SV2 you can only drag parameter control points with the mouse; their exact position and value are not shown. These three side panels make quantitative editing possible.

### Scripts

| File | Panel title | Purpose |
|---|---|---|
| `SV2_ParamPointEditor.js` | Param Point Editor | Select one point to read and type its value, bar/beat, quarter notes and seconds; step to the previous/next point on the curve |
| `SV2_ParamPointBatch.js` | Param Point Batch | For several selected points on one curve: set one value, linear/cosine/ease transitions, scale around a center, quantize to a grid, space evenly; statistics in the status box |
| `SV2_ParamCurveTools.js` | Param Curve Tools | Curve value at the playhead and insert a point there, simplify a curve, copy selected points to another parameter or note group |

The scripts are independent; install only the ones you need.

### Install

1. Requires Synthesizer V Studio 2 Pro **2.1.2 or later** (side panel scripts were added in that version).
2. Copy the `.js` files from `scripts/` into the SV scripts folder:
   - Windows: `C:\Users\<user>\AppData\Roaming\Dreamtonics\Synthesizer V Studio 2\scripts`
   - macOS: `/Users/<user>/Library/Application Support/Dreamtonics/Synthesizer V Studio 2/scripts`
3. Rescan scripts in SV and enable the panels in the side bar.

### Languages

The UI follows the SV interface language: Simplified Chinese, Traditional Chinese, Japanese and English. Any other language shows English. Restart SV if a language change does not take effect.

### Known limitations

These come from the SV scripting API and cannot be worked around by a script:

- **No coordinates on mouse hover**: the API has no mouse events.
- **No live value while dragging**: SV does not expose the new selection or curve data until the mouse is released.
- **Interpolation (linear/cosine/spline) is set per parameter curve**, cannot be changed by scripts, and cannot differ per segment. For a local straight line, use Batch → Transition → Generate by density to approximate it with dense points.
- **Undo (Ctrl+Z) has not been verified**: save your project before batch edits.
- Behaviour has been tested in the bundled mock only; please verify in your own SV setup.

### License

[GNU GPL v3.0](LICENSE). You may use, modify and distribute it freely; modified versions you distribute must also be released under GPL-3.0.

---

## Development

`scripts/` is generated; edit `src/` instead.

```
src/common.js              shared helpers, inserted into every panel at //@@COMMON@@
src/ParamPointEditor.js    one source file per panel
src/ParamPointBatch.js
src/ParamCurveTools.js
src/i18n/<lang>.json       English text -> translation (zh-cn, zh-tw, ja-jp)
tools/build.py             builds scripts/ and checks the sources
tests/mock_sv.js           mock of the SV scripting API for Node.js
tests/run_tests.js         tests against the built scripts
```

Build and test (Python 3 and Node.js, no dependencies):

```
python3 tools/build.py
node tests/run_tests.js
```

`tools/build.py` fails when:

- a `T("...")` string, parameter name or unit has no translation in one of the languages;
- the `%1`, `%2` ... placeholders differ between English and a translation;
- `getClientInfo()` contains non-ASCII text (SV refuses to load a side panel whose name is not ASCII);
- `SV.T`, `T(` or `SV.refreshSidePanel` runs at the top level of a script. While a script is loading SV has not read `getTranslations` yet, so the panel title would be cached in English.

To add a UI string: wrap the English text in `T("...")` in `src/`, add the same English key to every file in `src/i18n/`, then build. Use `%1`, `%2` for numbers so each language can order them freely.
