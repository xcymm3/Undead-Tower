# Task Spec: rogue-playtest-revision-20260905

## Metadata
- Task ID: rogue-playtest-revision-20260905
- Created: 2026-09-05T01:35:59+00:00
- Repo root: D:\mydoc\React\undead-tower
- Working directory at init: D:\mydoc\React\undead-tower

## Guidance sources
- AGENTS.md

## Original task statement
# 昨日试玩修订：6 小时 Deadline-Carl Loop

任务 ID：`rogue-playtest-revision-20260905`。用户要求使用 Deadline-Carl 3.3.0 新建修订 Loop，提供 360 分钟有效运行预算，不自动延长。仓库为 `D:/mydoc/React/undead-tower`，分支 `rogue`。必须直接接续上一任务 `rogue-six-weapons-20260904` 留在工作区的实现，不能 reset、clean、checkout 或丢弃现有未提交改动；旧任务的 proof 仅是历史输入，不能当作本任务 PASS。

## 用户反馈与强制要求

1. 修复巨人偶尔出生在树林、因体型过大无法通过后绕到固定视野之外的问题。出生筛选、完整导航路径和巨人体积必须一致；巨人不能被传送、挪动或跳过配额来掩盖问题。增加原问题入口和长路径回归。
2. 巫师受击瞬移必须有清楚的离场、过渡和落地特效。所有具有特殊行为的新僵尸也必须有可辨识的触发特效、音画反馈或状态提示，并遵守实例/短效上限和回收规则。
3. 中后期需要逐步淘汰普通、路障、铁桶等弱敌，显著提高强敌占比，不能只无限叠加弱敌数量。组成曲线应分阶段并可测试；结合平衡目标重新验证。
4. 移除“精准射击”的爆头倍率成长，替换为独立的暴击率和暴击伤害成长。暴击可作用于身体命中，爆头仍保留武器基础倍率；预览、伤害反馈、图案、构筑、模拟和实际碰撞必须一致。
5. 波前 3 秒倒计时只保留轻量界面提示，不阻止玩家瞄准、射击、换弹、使用技能或其他正常动作；不再用全屏交互层锁住输入。明确敌人/战斗时钟在这三秒的规则并测试暂停、后台和波间衔接。
6. 将六枪初始装填速度降为当前的一半，即基础装填耗时变成当前的两倍，使装填成长具有明显价值。重新检查逐发装填、技能冲突和整体平衡，不能仅修改文案。
7. 替换铁桶受击音色，制作更真实的分层金属敲击声，同时保持低多边形游戏的音频风格、随机细微变化、音量层级和静音/音量设置。
8. 使用 Hallmark 1.1.0 对首页、设置页、升级页等界面做简洁化改造，重点删除多余小字，只保留玩家做决定所需的信息。先读取现有设计、样式和 `.hallmark` 记录；在修改前于任务记录中列出预计修改/新增文件，不删除现有路由或组件。沿用现有品牌、低多边形场景和信息架构，创建/复用命名设计令牌，支持完整交互状态、键盘焦点、窄屏和 `prefers-reduced-motion`。动效只用于状态信息，升级卡淡入淡出必须流畅且不阻塞。完成实际多视口截图、交互检查和 Hallmark slop test；“成熟美术标准”需要用具体视觉证据和已知限制说明，不能只凭渲染成功宣称。
9. 持盾者与护理者当前行为收益太低，删除这两个设计并替换为两种不同、可感知、对后期战局有实际威胁的僵尸。替代者不能只是血量换皮，必须具有独立外观、行为、触发特效、反制方式、导航/碰撞/击杀/特写/配额/性能集成。
10. 新增僵尸整体改为更强并在更后波数出现。狂暴者必须按用户示例改为后期敌人：总生命为当前巨人总生命的两倍，正常阶段为普通僵尸速度，生命降至 40% 后一次性狂暴到 1.8 倍速度。游走者和两种替代敌人的数值、首次波数与职责必须随新的中后期组成曲线设计。

## 继承与验收约束

- 保留并完成上一任务的六枪肉鸽、六种右键技能、技能升级、稀有度/图案/构筑栏、十类敌人总量、六枪排行榜、实例化渲染和有效时钟规则；本次替换两类后敌人总数仍为十类。
- 平衡目标继续为普通玩家代理平均通过约 20 波，冻结时设明确区间；玩家不应过早失败，高水平也应极少达到 50 波。必须用实际生产配置、多随机种子、六武器和多操作水平验证均值、中位数、分位数、50 波达到率及枪间差异。不能强制第 50 波失败，不能把诊断自瞄当普通玩家，必须明确缺少真人样本的限制。
- 可以复用上一任务已经通过且源码哈希仍匹配的检查点作为调查材料，但本任务必须形成独立 spec、plan、evidence 和 fresh verdict。源码变化影响的检查必须重跑，不能把旧报告直接提升为新 PASS。
- 浏览器和桌面验收保持单实例、单 worker、隐藏、无焦点、不全屏、无声音；CPU 密集矩阵与 3D 验收不并发。不要打包或修改 portable EXE，用户本次只要求源码 Loop。
- 固定朝向和有限视角不变；枪口、准星与弹道共享真实目标点；场景障碍与寻路继续生效。正式刷新上限每秒 10 只，活跃实例和短效有硬上限，暂停/后台不推进成绩或技能。
- 所有 Git 提交遵循仓库中文 Conventional Commits。只有全部必要验证和 fresh verifier 通过后才完成任务并推送 `origin/rogue`；预算不足时保存可运行实现并诚实报告缺口，不自动延长、不虚报完成、不打包 EXE。

## 交付顺序

先冻结新需求和接续边界；优先修复巨人路径、战斗数值/组成、暴击与倒计时的可玩闭环，再完成特殊敌人和音画反馈，随后按 Hallmark 精简界面，最后完成平衡矩阵、实际静默回放、视觉证据、资源压力、正式 evidence 与独立 verify。时间压力不能把上述用户要求降级为可选项。

## Frozen contract

本节于 2026-09-05 的 freeze 阶段冻结。原始任务全文保留在上方；以下 AC1–AC14 与 WI-001–WI-016 全部为 mandatory。交付顺序只决定执行优先级，不改变 PASS 语义。允许在不改变机制身份、首次波数、测试样本、统计定义或门槛的前提下调节未明确锁死的伤害、血量、持续时间、冷却、波次数量和特效密度，以满足平衡和性能目标。

### Baseline and inherited boundary

- 当前分支为 `rogue`，HEAD 为 `d4a85a74aa0af3dabdbc3f18013756222cf21f04`，关联远程 `origin/rogue`。freeze 时工作区有 68 个状态项，绝大多数是上一任务 `rogue-six-weapons-20260904` 的未提交实现和 proof 工件；这些改动全部视为用户要求接续的既有工作，不得 reset、checkout、clean、覆盖或拆除。
- 已读取根 `AGENTS.md`，未发现更深层指导文件；已读取上一任务 spec/progress/evidence、当前游戏/升级/敌人/导航/音频/UI/测试入口、`docs/ROGUE-BALANCE-METHOD.md`、`src/ui/rogue-tokens.css`、`src/ui/rogue.css` 与 `.hallmark/log.json`。旧任务未形成 fresh PASS，其报告只能用于定位实现缝隙和估时。
- 当前已继承六枪、六技能、19 项升级、十类敌人、实际规则代理、静默回放和资源检查，但仍保留旧持盾者/护理者、爆头成长、全屏倒计时、过快基础装填、旧铁桶合成音，以及上一轮不完整的 200/864 矩阵。所有受本次规则变化影响的检查必须从当前源码重跑。
- 当前巨人为 2000 身体生命 + 600 护甲，本文把“总生命”明确解释为可受伤害的总耐久 2600；狂暴者冻结为无护甲 5200 身体生命，等于当前巨人总耐久的两倍。若后续调整巨人基础耐久，狂暴者必须继续由同一生产公式保持恰好 2 倍，预览、模拟和实际对局读取同一来源。

### Giant spawn and complete-route contract

- 巨人不得使用 `west-woods` 或 `east-woods` 林地入口。其余入口必须先用与运行时移动相同的巨人导航实例、完整半径 `NAV_RADIUS * zombieScale('giant')`、同一静态障碍集合和同一到达目标生成候选完整路线，再判定合法；不得用普通僵尸半径筛选后再以巨人体积移动。
- 路线审查必须从最终出生点沿实际 waypoint/直达逻辑采样至突破边界，采样步长不大于 0.5 m；每段必须满足巨人膨胀障碍碰撞，并保持在固定镜头可瞄准的水平/垂直包络内。世界遮挡仍可形成短暂掩体，但路线不能绕到固定视野外。审查使用的纯逻辑必须被生产出生与回归测试共同调用，不能复制一套近似规则。
- 冻结原问题回归：`(-15.45, -18.9)` 和两个林地入口对巨人必须拒绝；`north-road` 长路径 `(1.4, -58)` 与 `checkpoint-passage` `(-7.2, -34)` 必须在实际世界中走完整路径并自然到达防线。另以固定 seeds 覆盖全部非林地入口、长路线、窄通道和出生占位冲突。
- 无合法点时保留队首巨人及波次配额，延后到下一合法刷新机会重试；不得传送、事后挪动、替换种类、计作已生成/已击杀或提前清波。刷新债务不能在恢复时突破每秒 10 只上限。

### Critical-hit and reload contract

- 移除升级 `head`（“精准射击”）及其爆头倍率成长。六枪保留各自不可成长的武器基础爆头倍率（缺省 2.0×）；任何通用或专属升级都不能改写该基础倍率。
- 新增两个独立成长：`critical_chance`（普通，基础暴击率 5%，每层 +5 个百分点，5 层后 30%）与 `critical_damage`（稀有，基础暴击伤害 1.5×，每层 +0.25×，4 层后 2.5×）。最终伤害顺序为武器/技能基础伤害 ×（爆头时武器基础爆头倍率）×（暴击时暴击倍率）；身体命中可暴击，爆头与暴击可以同时发生并显示“暴击爆头”。
- 每个真实发射的 projectile/ray 独立进行一次暴击判定：双持两枪独立，霰弹每颗弹丸独立，同一狙击贯穿弹对沿线目标共享该弹的判定。未命中不能产生伤害反馈；暴击随机流与刷怪、升级、代理命中流分离且可复现。实际碰撞结算、代理模型、回放、升级预览、伤害反馈、构筑摘要和独立图案必须读取同一公式。
- 左轮 `revolver_deadeye` 不再增加爆头倍率，改为死眼锁定期间每层 +15 个百分点暴击率（3 层，仍受 100% 硬上限）；名称、说明、图案和前后预览同步改为暴击语义。每枪有效升级池仍至少 9 项、覆盖三档稀有度，旧存档中 `head` 层数可忽略但不能令读取崩溃或污染新局。
- 六枪基础装填耗时精确变为当前两倍：rifle 1.55 s、p90 1.80 s、pistol 1.70 s、revolver 2.40 s、shotgun 0.40 s/发、sniper 2.00 s。只改基础配置不算完成；升级预览、动画/机械状态、空匣反应、逐发装填、技能冲突、模拟及实际对局都必须使用新值。装填成长仍从不可变基础值计算并显著缩短时间，不能改文案掩盖实际值。
- 保留上一任务技能规则：换弹中拒绝激活且不耗 CD；技能期间允许正常装填，rifle 超载期间忽略装填请求；逐发霰弹可在合法开火/切枪状态中断并保持每发进度语义；暂停、后台、波间和重开不会错结算装填或技能。

### Three-second preparation contract

- 每波前 3 秒仍显示倒计时，但 UI 是不遮挡准星、弹药、技能和主要战场的轻量状态提示；删除全屏背景和独占交互层，不再用 z-index、pointer capture 或 phase guard 阻止瞄准、左键射击、R 装填、右键技能、设置/静音、Esc 暂停等正常动作。
- 倒计时使用可见且未暂停的准备时钟。准备期间玩家机械时钟正常前进：射速、枪械动画、装填、技能持续和 CD 都会消耗这 3 秒，射击正常消耗弹药并产生真实遮挡/反馈；因此提前开技能会真实损失持续时间，不提供免费预充。
- 敌人/成绩时钟在准备期间冻结：波次队列可以预建，但不出生、不移动、不治疗/增益/瞬移、不积累刷新债务；`Encounter.elapsed`、有效坚守时间、清波时间、技能威胁代理和排行榜成绩均不增加。倒计时归零后的下一更新才启动刷新与敌人行为。
- 暂停或后台使倒计时、玩家机械时钟和敌人/成绩时钟全部冻结并清除按住输入；恢复后需新按下，继续剩余准备时间。升级确认进入下一波倒计时；失败、重开和返回菜单清理准备状态。首波、波间、暂停中点、后台中点、零点边界及连续两波均须测试。

### Ten-enemy roster and phase composition

最终种类固定为十类：`normal`、`cone`、`bucket`、`football`、`giant`、`wizard`、`skitter`、`charger`、`howler`、`berserker`。删除 `shield`/持盾者与 `medic`/护理者的配置、行为、外观、提示和波池入口；兼容代码可安全读取旧诊断数据中的字符串，但它们绝不能在新正式对局生成。替代者不能复用旧减伤/治疗机制冒充新设计。

| Kind | 冻结数值与首次波数 | 独立行为、反馈与反制 |
| --- | --- | --- |
| `skitter` 游走者 | 900 身体生命、无护甲、基础前进速度 1.4 m/s，第 10 波首次出现 | 沿真实导航路线作有界左右游走，不能穿越膨胀障碍；转向有身体倾斜/脚步轨迹与短促音色。反制为持续跟枪或霰弹覆盖。 |
| `charger` 突进者 | 1800 身体生命、无护甲、基础前进速度 1.4 m/s，第 13 波首次出现 | 距防线 10–24 m 且下一段真实导航直线可通行时，0.8 s 明显蓄力后以基础速度 2.2× 冲刺最多 1.25 s；任意真实命中可打断蓄力并造成 0.7 s 踉跄，5 s 后才可再尝试。冲刺逐步做导航/碰撞，碰障立即结束，绝不传送。蓄力、冲刺、打断各有不同姿态、短效和音色。 |
| `howler` 号令者 | 1600 身体生命、无护甲、基础前进速度 1.4 m/s，第 15 波首次出现 | 7 m 内至少两名其他活敌且视线可达时，0.9 s 抬头蓄势后发出号令，使范围内其他活敌速度提高 35% 持续 3 s；不作用自身、不叠乘，只刷新较长剩余时间，冷却 7 s。蓄势中任意命中打断并进入 3 s 失败冷却。环形波、受影响标志、起止音明确；优先击杀/打断是反制。 |
| `berserker` 狂暴者 | 有效总生命 5200、无护甲、基础前进速度 1.4 m/s，第 18 波首次出现 | 生命首次降至 40% 或以下时一次性永久狂暴到基础速度 1.8×（2.52 m/s），不能重复触发；触发有明显变色、姿态、冲击短效和音色。反制为保留爆发伤害完成击杀。 |

- 原强敌首次波数保持 football=4、wizard=6、giant=8；四个新/替代敌人按上表后移，至第 18 波全部十类已可正常生成。首次出现有一条可决策的应对提示，不堆叠背景小字。
- `normal + cone + bucket` 定义为弱敌。波池必须分阶段且由纯函数可测试：第 5/10/15/20/25 波的弱敌占比分别不高于 75%/55%/35%/15%/0%；从第 10 波后弱敌绝对数量逐波不增加，并至少每两波减少一次，至第 25 波三类均为 0，此后不再回流。对应强敌占比在这些检查点单调上升，不能靠无限增加弱敌总数制造难度。
- 每波仍是有限确定配额，正式刷新率最多 10/s、同时实体槽最多 256。特殊行为不能增加/跳过波配额、重复击杀或提前清波；死者不移动、发号令、被增益、瞬移或二次触发。所有种类可沿有效路线自然突破，并进入正确种类的约 2 秒失败特写。

### Special feedback and audio contract

- 巫师非致命受击瞬移改为清晰的三段反馈：旧位置离场闪光/残影、连接两端的短暂过渡轨迹或离散残像、新位置落地环/尘粒；离场、过渡、落地总可见窗口 180–320 ms，配一组方向可辨的离场与落地短音。逻辑落点仍通过巨细一致的导航、占位、固定视野和世界遮挡校验；死亡巫师不瞬移，同一扳机聚合后最多触发一次。
- 游走转向、突进蓄力/冲刺/打断、号令蓄势/生效/结束、狂暴触发都必须有可辨识的姿态、代码原生低多边形短效、合成音或 HUD/状态标记；不得只改速度/数值。视觉和声音可被静音/reduced-motion 降级，但状态信息仍清楚。
- 所有短效复用几何/材质或对象池，继续共用硬上限 160；达到上限时回收最旧的纯装饰短效，不能回收状态真值、生成额外场景节点树或改变伤害。重开、失败、返回菜单和 dispose 后短效为 0；10 次预热后重开不得单调增加 scene children、geometry 或 texture。
- 铁桶命中音替换为分层金属敲击：20–45 ms 瞬态/噪声敲击层、至少 3 个非整数关系的中高频衰减共振层、一个较低的桶腔体层；完整桶命中和桶破裂具有不同包络/音高。至少 4 个可复现的细微变体，音高约 ±3%、衰减约 ±8%、增益约 ±10%，连续命中不机械重复。
- 铁桶音经过同一 master、静音和 0–100% 音量设置；峰值低于主枪声且高于普通身体命中提示，最多 6 组金属音并发，淘汰最旧音源。不得加载未授权外部采样；保持短促、干燥、低多边形合成音风格。单元测试验证分层、变体、并发、完整/破裂差异和静音；实际静默验收只能检查状态/诊断，主观听感限制在 evidence 中诚实记录。

### Hallmark 1.1.0 redesign contract

- 本任务按 Hallmark 1.1.0 的现有应用多界面 redesign 处理。非交互 supervisor 不等待确认，冻结推断为：受众是键鼠游玩的现有玩家；首页的核心动作是选择模式/武器并开始，设置页是快速调整音量/画面，升级页是理解三项差异并确认；genre=`atmospheric`，tone=`utilitarian/austere field equipment`。继续使用暗绿、沙色、琥珀强调、Barlow Condensed + IBM Plex Mono、原创低多边形实景和既有信息架构，不引入模板站式 hero、外部照片或装饰性库存图。
- 首页/部署、设置对话框、升级页/构筑栏共享一个 `designed-as-app` 系统。保留 live Three.js canvas 作为主视觉，界面采用紧凑 workbench/field-console 结构；不删除路由、现有组件或功能。创建 `design.md` 锁定应用级主题/字体/间距/动效/CTA 语气，并让 touched UI 的颜色、字体、4pt 间距、时长、easing 和 focus 样式只引用命名 token；不要求本任务重写未触及的 3D 材质颜色。
- 精简只删除重复、不可决策的小字：主页必须保留模式、六枪、技能一句话、开始、排行榜和必要限制；设置保留静音/总音量/像素效果/完成及当前值；升级卡保留稀有度、独立图案、名称、当前/上限层数、准确的前后数值和确认动作；HUD 保留波数、敌情、弹药、装填、技能、构筑和暂停所需信息。不得删掉已有路由、组件、键盘能力、排行榜或设置。
- 所有触及的交互控件提供 default、hover、focus-visible、active、disabled、loading、error、success 的真实或可测试状态；focus ring 立即出现且对比至少 3:1，状态不能只依赖颜色。点击文案保持单行，标题可在长词内换行，图像网格使用 `minmax(0, 1fr)`；`html` 与 `body` 使用 `overflow-x: clip`，在 320/375/414/768 px 无水平滚动。
- 动效只承载状态。升级卡进入/确认退出使用 transform/opacity，正常模式 180–260 ms、无 bounce/overshoot、不阻塞确认或下一波；`prefers-reduced-motion` 降为不超过 150 ms 的 opacity 或无空间移动。倒计时、技能、敌人触发与错误反馈不能依赖纯动效才可理解。
- Hallmark handoff 前执行六轴 pre-emit critique（Philosophy/Hierarchy/Execution/Specificity/Restraint/Variety，任一低于 3 必须返修）和完整 58 项 slop test；以实际 1440×900、1280×720、768×1024、414×896、390×844、375×812、320×568 截图及键盘流程检查。成熟美术标准只按层级、可读性、风格一致、状态反馈、动效节奏、遮挡、响应式与 slop test 的具体证据陈述，不声称外部美术认证。

#### Hallmark pre-flight findings and expected file plan

- 已检测 React 19 + Vite 8；字体依赖为 `@fontsource/barlow-condensed` 与 `@fontsource/ibm-plex-mono`；无第三方 motion 库，继续 motion-cut；根 `tokens.css` 与 `src/ui/rogue-tokens.css` 已存在；`.hallmark/log.json` 最新系统为 `Photographic (live game canvas)` / custom dark + condensed + amber / N9 / Ft2。`package.json` 晚于现有记录且没有 `.hallmark/preflight.json`，build 阶段应创建/刷新缓存。
- 预计修改：`tokens.css`、`src/style.css`、`src/ui/rogue-tokens.css`、`src/ui/rogue.css`、`src/App.tsx`、`src/ui/SessionPanels.tsx`、`src/ui/UpgradePanel.tsx`、`src/ui/BuildInventory.tsx`、`src/ui/SkillHud.tsx`、`src/ui/UpgradeIcon.tsx`、`.hallmark/log.json`。
- 预计新增：`design.md`、`.hallmark/preflight.json`。预计删除：None。
- 若实现时确认某个额外文件是满足已冻结 AC 的最小必要边界，可新增到对应 progress note；不得借此扩大产品范围。任何删除或路由/组件树替换都不在授权内。

### Frozen balance protocol

- 测量对象是变更后的实际正式肉鸽 hard 规则；`completed` 为完整清除波数，失败波为 `completed + 1`。进入第 50 波定义 `completed >= 49`，通过第 50 波定义 `completed >= 50`。不得设置第 50 波硬失败、代理专属伤害、隐藏清场或把超时写成自然失败。
- 代理输入保持上一任务公开定义，避免调代理凑结果：regular 命中 0.70、命中后爆头 0.45、半自动最小点击 0.20 s、换目标 0.22 s、空匣反应 0.25 s、技能反应 0.35 s；skilled 为 0.88/0.75/0.14/0.12/0.12/0.20；expert 为 0.96/0.92/0.115/0.05/0.06/0.10。暴击由生产规则独立抽取，代理不能选择“这发暴击”。
- 升级策略保持：regular 偶数 seed 在有效三选一中均匀随机，奇数 seed 按伤害 > 射速 > 暴击率 > 暴击伤害 > 技能冷却 > 技能持续 > 当前武器专属 > 弹容 > 装填的稳定优先级；skilled/expert 先取最高稀有度再用同一顺序，禁止预知未来。旧“爆头”优先项被两个暴击项明确替代。
- 正式矩阵固定为 6 枪 × 3 水平 × 24 seeds × 60/30 FPS = 864 局，seeds=`42031 + i * 177`。每局自然失败或达到完整通过 60 波/3600 s 有效战斗时间；上限退出标 `censored`。报告逐局数据，并按枪/水平/FPS及合并组给 n、均值、中位数、P10/P90、最小/最大、早于 10 波失败率、进入/通过 50 波率、censored、普通均值近似 95% 区间和 50 波率 Wilson 95% 区间。
- PASS 门槛保持：60 FPS 每枪 regular 平均 completed 在 18–24、P10 >= 10，六枪最高/最低均值差 <= 6；30 FPS 各枪 regular 均值相对本枪 60 FPS 偏移 <= 20%，合并均值 16–26；skilled 与 expert 在每档 FPS 的合并进入 50 波率分别 <= 1%，且每枪每组最多 1/24 进入 50 波。普通组有 censored，或高水平未到 50 前 censored，相关门槛为 UNKNOWN/FAIL，不能外推。
- 模型继续调用生产 `Encounter`、枪械/技能、升级、波池、暴击、装填、导航/碰撞、瞬移、游走、突进、号令和狂暴规则；不能维护另一份旧 enemy/crit/reload/countdown 近似。当前变化后从新 scratch 重跑完整矩阵，旧 200/864 检查点不能 resume 或提升为证据。
- 真实校准仍为单个隐藏静音 3D 实例顺序运行 12 局：六枪各 regular seed 42031 与 expert seed 42208。completed 绝对差中位数 <= 2、最大 <= 5，进入 50 波判断一致；并比较命中/爆头/暴击率、技能次数/时长、敌人构成和构筑。不得以诊断无误差自瞄、删样本或旧回放替代。
- 这些是固定代理样本，不是真人试玩。evidence 必须明确缺少真人样本、音频主观试听和外部美术评审的限制，不得把代理均值表述为所有真人平均波数。

### Acceptance criteria

- AC1: 巨人不再从两侧树林生成；出生点、完整导航路径、运行时碰撞均使用同一巨人体积，原坏点和长路径回归通过。无合法点时保留配额重试，未发生传送、挪动、替换或跳过。
- AC2: 巫师瞬移具有清楚的离场、过渡和落地三段音画反馈；游走、突进、号令与狂暴的特殊行为均有可辨识触发/活动/结束或打断反馈，短效和音源受限并可回收。
- AC3: 波池按冻结检查点逐步淘汰 normal/cone/bucket 并显著提高强敌占比；第 25 波后三类弱敌为零，曲线确定、可测试且不靠无限弱敌堆量。
- AC4: “精准射击”爆头成长被独立暴击率/暴击伤害成长完全替换；身体可暴击、爆头保留基础倍率并可与暴击叠加，预览、图案、构筑、反馈、模拟和真实碰撞逐项一致。
- AC5: 每波前 3 秒仅有轻量提示且所有正常玩家动作可用；玩家机械时钟前进，敌人/刷新债务/成绩时钟冻结，暂停、后台、波间和零点衔接符合冻结规则。
- AC6: 六枪基础装填耗时精确变为旧值两倍；装填成长、逐发装填、枪械动画、技能冲突、模拟和真实对局使用同一新配置并有行为断言。
- AC7: 铁桶命中/破裂使用分层、具细微变化的真实感合成金属敲击，混音层级和并发受限，统一服从静音/音量设置且与路障/身体音色不同。
- AC8: 首页/部署、设置、升级/构筑按 Hallmark 1.1.0 精简并共享命名设计令牌；保留品牌、实景、信息架构、路由和组件，完整状态、键盘焦点、窄屏、reduced-motion 与不阻塞升级动效通过实际检查。
- AC9: `shield` 与 `medic` 从新正式规则中删除，替换为冻结的 `charger` 与 `howler`；最终仍恰好十类，每个替代者有独立外观、行为、反馈、反制和导航/碰撞/击杀/特写/配额/性能整合。
- AC10: skitter、charger、howler、berserker 按冻结血量、速度、首次波数和职责变强后移；狂暴者总耐久始终是当前巨人的 2 倍，40% 阈值前 1.4 m/s、之后一次性 1.8×，实际与模拟一致。
- AC11: 继承的六枪正式闭环、六右键技能、技能成长、稀有度/图案/构筑栏、练习模式静止复位、六枪排行榜与旧榜保留仍可用；受本次修改的生命周期和持久化没有回归。
- AC12: 新生产配置完成可复现的 864 局矩阵并满足全部冻结均值、分位数、50 波率、枪间和 FPS 门槛；12 局真实静默配对满足误差门槛，逐局数据/哈希/限制完整，不存在硬性 50 波失败或挑样本。
- AC13: 固定朝向/有限视角、枪口-准星-弹道共享目标点及枪口遮挡、有效游玩时钟、标题/暂停按需绘制与后台停绘均保留；刷新 <=10/s、实例槽 <=256、短效 <=160，压力与 10 次重开没有持续资源增长。
- AC14: 当前源码通过单 worker 全量单元、TypeScript/生产构建、完整隐藏静音 E2E、资源检查、实际多视口截图/交互审查、Hallmark 六轴 critique 与 58 项 slop test；设计/操作/平衡文档准确，未打包或修改 portable EXE。

## Delivery order

1. **可用端到端核心优先**：WI-001–WI-006。先完成巨人路径、暴击闭环、六枪装填、非阻塞倒计时、阶段波池与新敌人数值/行为核心，始终保持可构建可游玩的网页版本。
2. **其余 mandatory 整合**：WI-007–WI-012。完成替代敌人的实例化外观/反馈、巫师三段瞬移、铁桶音色和 Hallmark 三界面改造，再同步模拟/回放/诊断接口。
3. **mandatory 验收与收束**：WI-013–WI-016。执行单元/E2E/资源/视觉检查、完整矩阵与 12 局配对，按生产配置最小调参，整理文档和 fresh proof；任何 AC 未过都不能声称 PASS。
4. **可选 polish 最后**：只有 mandatory 实现和检查均就绪且 supervisor 明确授权时才做 `## Quality opportunities` 中的单一有界改进；进入 ship/last-call 立即停止可选工作，优先保留稳定核心与诚实缺口。

## Work items
| Item | Description | Acceptance criteria |
| --- | --- | --- |
| WI-001 | 统一巨人出生与完整路线审查，禁用林地入口并保留失败配额重试 | AC1, AC13 |
| WI-002 | 用共享伤害公式实现暴击率/暴击伤害、替换旧爆头成长及左轮专属协同 | AC4, AC11 |
| WI-003 | 将六枪基础装填耗时翻倍并整合成长、逐发装填、动画和技能冲突 | AC6, AC11 |
| WI-004 | 重构 3 秒准备阶段的输入、玩家机械时钟、敌人/成绩时钟及轻量提示 | AC5, AC13 |
| WI-005 | 重做分阶段波池，淘汰弱敌并冻结四类新/替代敌人数值与首次波数 | AC3, AC9, AC10 |
| WI-006 | 删除持盾/护理规则，实现突进者、号令者及游走/狂暴完整生产行为 | AC2, AC9, AC10 |
| WI-007 | 制作四类后期敌人的实例化低多边形外观、触发短效、状态标志与回收 | AC2, AC9, AC13 |
| WI-008 | 实现巫师离场/过渡/落地瞬移反馈并保持聚合、落点和生命周期正确 | AC2, AC13 |
| WI-009 | 替换铁桶分层金属敲击、细微变体、混音/并发管理及音频测试 | AC7, AC14 |
| WI-010 | 建立 Hallmark app 设计系统与令牌，精简首页/部署和设置界面 | AC8, AC14 |
| WI-011 | 精简升级/构筑/HUD，接入暴击图案与准确预览、完整状态和流畅动效 | AC4, AC5, AC8 |
| WI-012 | 同步生产规则到平衡模型、代理、回放、资源/视觉诊断和机器可读输出 | AC4, AC5, AC9, AC10, AC12 |
| WI-013 | 扩充巨人长路径、暴击、装填、倒计时、十敌行为/波池、音频与资源单元测试 | AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC9, AC10, AC13 |
| WI-014 | 扩充单 worker 隐藏静音 E2E，覆盖六枪闭环、准备输入、特效状态、特写和持久化 | AC2, AC5, AC8, AC9, AC11, AC13, AC14 |
| WI-015 | 运行并调至完整 864 矩阵和 12 局真实配对满足冻结门槛，保留全部样本和哈希 | AC3, AC4, AC6, AC10, AC12 |
| WI-016 | 完成 Hallmark 多视口/键盘/slop review、资源压力、全回归和设计/操作/平衡文档 | AC7, AC8, AC11, AC13, AC14 |

## Constraints

- 当前 freeze 迭代只修改本 `spec.md`；不修改生产代码、plan/progress、evidence/raw、verdict/problems 或 `.agent/durable-loop/`。supervisor 从稳定 Work items 表冻结 plan。
- 后续 build 读取 plan/progress，只更新任务相关生产源码、测试、文档、Hallmark 记录和 progress；evidence 停止改生产代码，例行结果先写当轮 `DEADLINE_CARL_OUTPUT_DIR`，只精选 criterion-level proof 到 formal raw；verify 只替换 verdict/problems 并重跑当前检查；fix 做最小安全修复并刷新证据。
- 360 分钟有效预算不自动延长。预算紧张不能删除 AC、改样本/代理、降低门槛或把 mandatory 改成可选；未完成项保持 FAIL/UNKNOWN 并在 last-call 写 deadline-report。
- 不启动子代理；用户没有要求本轮委派。3D 浏览器与桌面验收始终单实例、单 worker、headless/hidden、无焦点、不全屏、强制静音；CPU 密集矩阵、3D 回放、E2E、构建顺序运行，不并发争用机器。
- 不启动旧 portable EXE，不运行 `dist:portable`，不修改 `release/` 或成品。默认只交付源码和网页。
- 保留 M0 固定朝向、有限视角、原创低多边形风格、真实世界遮挡与共享瞄准点。不得导入《未转变者》模型/贴图，不新增自由移动、Pointer Lock 或累积转向。
- 正式模式刷新最多 10/s、实例槽最多 256、短效最多 160；移动、准备规则、技能和成绩只使用冻结的有效时钟。练习敌人静止且击倒复位，只有正式模式自然失败保存相应六枪 hard 排行榜。
- 排行榜继续使用版本化 key，旧 key 不删除不覆写；暴击、多弹/穿透不得重新引入 `kills <= hits` 的错误校验。损坏或不可写 storage 不阻止游戏并给出可理解反馈。
- 所有 Git 提交使用 `<type>: <简体中文具体摘要>`；只有全部必要验证和 fresh verifier PASS 后才提交并推送本任务相关文件到 `origin/rogue`。不使用宽泛 `git add .`，不混入 scratch、supervisor 状态、日志、视频、隐私记录或用户无关改动；推送受阻只说明原因，不强推/改写历史。

## Non-goals

- 不增加第七把枪、新难度、玩家移动/生命、联机、商店、局外成长、装备掉落、触屏射击或第 50 波通关/强制失败。
- 不恢复持盾减伤或护理治疗，不把突进者/号令者做成单纯血量/颜色换皮，不新增超过十类的正式敌人。
- 不全面重制六把枪、整个 3D 场景或所有音频；铁桶以代码合成分层音为本次范围，不采购/下载外部采样。
- 不删除/替换路由树、组件目录或已有品牌信息架构；Hallmark 只精简和统一本次列出的现有界面，不建设营销站、外部资产库或全新页面。
- 不把模型结果包装成真人试玩、外部美术认证或主观音频认证；已知缺少真人样本、扬声器试听和外部美术评审必须披露。
- 不打包 portable EXE、不做可见桌面验收、不部署网站、不新增无关 lint 工具链或重构无关架构。

## Quality opportunities

- Q1: 在所有 mandatory AC 与当前检查均已满足后，仅微调首页、设置和升级页已令牌化的间距层级与 opacity/transform 缓动，使三种视口间的视觉节奏更一致；不得新增文案、组件、玩法、粒子类型或依赖。停止条件：最多一轮 15 分钟改动加 10 分钟增量多视口/reduced-motion 复验，任一功能/布局回归即撤销该 polish 的最小 diff 并回到 evidence。

## Verification plan

### Commands and output discipline

后续阶段使用当轮 scratch，PowerShell 每条命令单独检查 `$LASTEXITCODE`；例行测试不得直接写 formal raw。若系统 `npm.ps1` 失效，使用同一 Node 安装目录中的 `npm.cmd`，不得改变依赖版本来绕过。

```powershell
$taskScratch = $env:DEADLINE_CARL_OUTPUT_DIR
if (-not $taskScratch) { throw 'DEADLINE_CARL_OUTPUT_DIR is required' }
New-Item -ItemType Directory -Force -Path $taskScratch | Out-Null
npm run test -- --maxWorkers=1 2>&1 | Tee-Object -FilePath "$taskScratch/unit.txt"
npm run build 2>&1 | Tee-Object -FilePath "$taskScratch/build.txt"
npm run test:e2e -- --workers=1 --reporter=line --output="$taskScratch/e2e" 2>&1 | Tee-Object -FilePath "$taskScratch/e2e.txt"
npm run balance:rogue -- --output "$taskScratch/rogue-balance.json" --assert 2>&1 | Tee-Object -FilePath "$taskScratch/balance.txt"
npm run test:rogue:replay -- --output "$taskScratch/replay" --assert 2>&1 | Tee-Object -FilePath "$taskScratch/replay.txt"
npm run test:rogue:replay -- --resources-only --output "$taskScratch/resources" --assert 2>&1 | Tee-Object -FilePath "$taskScratch/resources.txt"
node scripts/rogue-visual-checks.mjs --output "$taskScratch/visual" --assert 2>&1 | Tee-Object -FilePath "$taskScratch/visual.txt"
git diff --check
```

- `npm run build` 的 `tsc -b` 是类型门槛；仓库没有 lint script，不运行臆造的 `npm run lint`。构建写入忽略的 dist，仅用于网页验证，不执行 Electron 打包。
- `balance:rogue --assert` 只在完整 864 局、样本/哈希完整且 AC12 所有门槛满足时退出 0。任何 `--quick`、过滤 profile/weapon/FPS、`--max-runs` 或 resume 检查点均标 non-formal 且不能成为 PASS。
- `test:rogue:replay --assert` 必须自动管理隔离端口、单个 headless muted 浏览器和隔离 storage，顺序完成固定 12 局；失败也清理浏览器/服务器。生产页不得暴露回放控制器或可写作弊入口。
- visual command 如现有脚本尚不支持 `--output/--assert`，在 build 中将其补成稳定接口；必须把截图写到 scratch/testInfo output，不能写 `test-results/` 固定共享位置或 formal raw。

### Required coverage

| Gate | 必须覆盖的实质断言/观察 | Criteria |
| --- | --- | --- |
| Giant path | 林地/旧坏点拒绝、两个长路径和全部合法入口完整追踪；统一半径、逐段碰撞/瞄准包络；失败重试不消耗配额 | AC1, AC13 |
| Critical/reload | 两成长公式/上限/预览；身体/爆头/暴击爆头；双持、散弹、贯穿判定粒度；旧存档；六枪精确基础装填、逐发与技能冲突 | AC4, AC6, AC11 |
| Countdown/time | 首波和波间 3 秒瞄准/射击/装填/技能/设置/暂停；玩家机械推进、敌人和成绩冻结；暂停/后台/零点无债务或双推进 | AC5, AC13 |
| Wave/roles | 十类映射、旧两类不生成、首次波、弱敌检查点/单调淘汰；游走、突进、号令、狂暴正反例和死亡/打断/障碍/配额边界 | AC2, AC3, AC9, AC10 |
| Feedback/audio | 巫师三段时序/端点/单扳机；四特殊敌人状态反馈；短效回收；铁桶三层以上、四变体、完整/破裂、并发和 master/mute/volume | AC2, AC7, AC13 |
| UI/Hallmark | 首页/设置/升级决定信息完整且冗余小字移除；8 states、键盘焦点/确认、暴击图案/预览、倒计时不遮挡；320/375/390/414/768/1280/1440 截图 | AC4, AC5, AC8, AC14 |
| Inherited loop | 六枪逐枪选择/技能/清波升级/自然失败/重开；练习六枪静止复位；排行榜只收正式自然失败、旧 key 保留；固定瞄准和真实枪口遮挡 | AC11, AC13 |
| Resource/idle | >=60 s 高密度技能压力窗、alive/effects/scene/memory 采样、标题/暂停/后台停绘与时钟、两次预热后 10 次重开稳定 | AC2, AC7, AC13 |
| Balance | 新源码完整 864 矩阵、所有统计/门槛/确定性；固定 12 局真实配对及误差；配置与源码 SHA-256、逐局数据、删失和限制 | AC3, AC4, AC6, AC10, AC12 |
| Final regression | 全量 unit、类型/生产 build、完整单 worker E2E、visual/resource assert、diff check；文档与当前 UI/规则一致，portable 文件 hash/状态未被本任务改变 | AC8, AC11, AC14 |

### Visual and Hallmark inspection

- 截图至少包含：首页/部署六枪、设置、准备倒计时可操作帧、普通/稀有/史诗升级卡、暴击与暴击爆头反馈、巫师离场/中间/落地、游走/突进/号令/狂暴触发、十类阵容、结果/构筑；动态中间帧用固定测试时钟采样，不以单张“渲染成功”替代动效审查。
- 每个视口检查水平滚动、点击文案换行、长内容滚动、准星/弹药/技能遮挡、focus 顺序、默认/hover/focus/active/disabled/loading/error/success、reduced-motion、升级确认不重复/不阻塞。检查实际对比和不靠颜色识别，不凭 CSS 静态阅读宣称视觉 PASS。
- Hallmark review 保存六轴 1–5 分数、58 个 gate 的逐项 yes/no 与发现/修正/复查。所有 gate 必须为 no，六轴最低 3；已知限制明确写入，不使用“成熟”“专业”空泛结论。

### Proof handoff and phase gates

- build 对每个触及 WI 更新 `progress.json` 的 state/note/proof；只有 WI-001–WI-016 全部 `implemented` 才返回 build completed。代码存在不等于 AC PASS。
- evidence 停止生产修改，从新 scratch 重跑当前必要检查，为 AC1–AC14 写 id、非占位 text、status、proof、gaps；精选机器统计、Hallmark review 和非隐私截图进入 raw。完成前运行：`python "C:\Users\86187\.codex\skills\deadline-carl\scripts\task_loop.py" validate --task-id rogue-playtest-revision-20260905 --repo-root "D:\mydoc\React\undead-tower" --artifact evidence`。
- fresh verify 独立判断当前源码和新命令结果，不能继承旧结论；每次替换 `verdict.json` 和 `problems.md`。problems 首行写 verdict 和 FAIL/UNKNOWN 精确数量，PASS 明确零问题。完成前用同一 validator 的 `--artifact verdict`。
- 任一 AC 缺当前证据或失败即不完成；fix 只做最小安全修复，再刷新 evidence 并由新 verify 重验。last-call 报告可说明可用核心和缺口，但不是 PASS。
