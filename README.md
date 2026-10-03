# Block Crush · Puzzle Master 研究复刻

这是按用户提供的游戏截图制作的浏览器研究原型。研究目标是把取证、界面测量、玩法推断、动画与音频验证组织成可重复的 Codex 工作流。当前实现聚焦 **Level 1 开局画面与可玩的本地规则**；参考画面和行为的证据等级、素材来源、待校准项见 [证据账本](docs/evidence-ledger.md)。本项目尚未通过逐像素、逐帧或原作音频一致性验收。

参考目标是 Google Play 上包名为 [`com.appidea.blast.out.color.brain.games` 的 Block Crush: Puzzle Master](https://play.google.com/store/apps/details?id=com.appidea.blast.out.color.brain.games)。用户截图是 Level 1 画面的主要布局依据；[Google Play 页面关联的短视频](https://www.youtube.com/watch?v=vkbPXolx2QI) 展示了后期关卡与 Village 场景，不能直接证明 Level 1 的所有规则或动效。

## 运行与验证

需要 Node.js 和 npm：

```bash
npm ci
npm run dev
```

打开 Vite 输出的本地地址，默认是 `http://127.0.0.1:5173/`。首次点击、触摸或按键后浏览器才允许启动音频。

```bash
npm test
npm run build
npm run preview
```

`npm test` 检查 8×8 初态、放置边界、行列同时清除与苹果计数、重开状态；`npm run build` 生成 `dist/`。浏览器人工验收步骤与仍待验证的项目列在 [证据账本](docs/evidence-ledger.md#浏览器验收清单)。

## 当前玩法

- Level 1 显示 8×8 棋盘、`0/3` 苹果目标、`2/500` 宝箱进度、一个带苹果的单格待放方块，以及底部道具和 Village 入口。
- 从下方拖方块到空格，或先点方块再点棋盘；放满一整行或一整列时清除。清除带苹果的格子会推进目标。三块用完后补出新的一组；没有合法落点时出现失败面板，集齐目标时可以进入下一关。
- 设置面板提供重开、音乐和音效开关。后续关卡开放本地实现的锤子、撤回、洗牌、换色和同色消除道具。它们的具体解锁与消耗规则尚未从 Level 1 参考中证实。
- 放置、清除、苹果飞入目标、得分提示、胜负反馈有本地动画和音效。动画延迟会在重开或换关后取消，避免旧事件影响新关。

棋盘规则与后续关卡是根据有限画面构造的**可玩研究假设**。请把账本中的 `已观察`、`推断`、`暂定实现` 分开阅读。

## 素材与音频

仓库提交了本项目绘制的 SVG 占位图、Lilita One 字体及其 OFL 许可文件。`.research/` 保存本地参考视频、截图、APK/XAPK 与提取研究文件；`public/local-reference/` 保存从本地 APK 研究包提取或转码的候选 PNG/WAV。两处都被 `.gitignore` 排除，不随仓库发布。缺少本地参考包时，界面自动使用仓库内 SVG/文字，道具反馈和背景音乐使用 Web Audio 程序合成。

短视频文件只有视频流，没有音轨；本地 APK 中找到的候选音效文件仍需通过实机触发与听辨确认对应关系。当前程序合成的循环音乐是原创暂定配乐，不能称为原作背景音乐。浏览器中的音乐与音效可分别在设置里关闭；偏好写入本地存储。

复刻方法整理在 [可复用 Skill](skills/game-replica-research/SKILL.md)，包含截图裁切、逐帧事件采样、状态转移记录、素材来源、音频重建和可见浏览器回归。该 Skill 同时安装为本机 Codex Skill：`~/.codex/skills/game-replica-research` 指向本目录中的文件。项目自身的观察与实现结论以 [证据账本](docs/evidence-ledger.md) 和 [逐帧索引](docs/frame-ledger.md) 为准。
