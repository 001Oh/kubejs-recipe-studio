# PACK-08 · D-2 基准包候选核验报告（只读，未复测）

日期：2026-11-01
用途：为 `PACK-07` 中 D-2 的"recipes 差 1"问题挑选合格的基准包
性质：**纯只读核验**。未修改/删除/重命名/移动任何包文件，未运行扫描，未创建用户数据目录，未改动代码/配置/台账/既有报告。

---

## 1. 结论

| 候选 | 295 jar | 多余配方 | 时间戳遗留 | 预期 recipes | 判定 |
| --- | --- | --- | --- | --- | --- |
| `pc3-pack-1112` | ✅ 295（与 pc7 同一 inode） | **有 +1**（`alltheores/…/brass_dust_from_alloy_blending.json`） | 无 | **32,891** | ❌ 不符合 |
| **`pc5-pack-1112`** | ✅ 295（与 pc7 同一 inode） | **无** | 无 | **32,890** | ✅ **推荐** |

**推荐：`E:\mc kjs\.cache\pc5-pack-1112`。**

依据一句话：`pc5` 的文件集 = `pc7` 的文件集 **减去** 那个导致 +1 的另存副本，除此之外（含全部 295 个 jar）与 `pc7` 完全一致；而 `pc7` 实测为 32,891，所以 `pc5` 应为 32,890。

---

## 2. 核验方法（全部只读）

| 手段 | 说明 |
| --- | --- |
| 目录遍历 + 文件清单 | Node 迭代遍历，生成三份包的完整相对路径清单（`.cache/pack-06/pack-compare.json`） |
| 集合差 | 以 `pc7` 为参照做三方差集，定位"独有/缺失"文件 |
| 内容哈希 | 对 `kubejs/**` 全部文件逐个算 SHA-256 前 16 位，确认**共有文件的字节内容**是否一致 |
| 硬链接同一性 | 读取 jar 的 `inode` 与 `nlink`，确认三份包的 jar 是否物理同一 |
| 配方条数 | 解析差异 JSON 的顶层结构（对象/数组）与 `type`，判定其解析为几条配方 |

**未做**：任何写操作、任何扫描、任何新建数据目录。

---

## 3. 逐项核验结果

### 3.1 JAR 数量与包结构（要求 1）

| 项 | pc3 | pc5 | pc7（参照） |
| --- | --- | --- | --- |
| 文件总数 | 1,659 | 1,658 | 1,659 |
| `mods/*.jar` | **295** | **295** | **295** |
| jar 集合差异 | 与 pc7 **完全相同**（仅 A=0 / 仅 B=0） | 与 pc7 **完全相同** | — |
| jar inode / nlink（抽样 3 个） | `281474977044405/438/465`，**nlink=4** | 同左（**同一 inode**） | 同左（**同一 inode**） |

**结论**：三份包的 295 个 jar 是**硬链接同源**（同 inode、nlink=4），物理上是同一份字节。
⇒ **items 43,474、icons 38,760、types 426 三项由 jar 决定的计数，三份包必然相同。**

### 3.2 `kubejs/data/**` 配方 JSON 清单（要求 2）

**pc5（推荐）——共 7 个 JSON，其中配方 2 条**

```
/kubejs/data/ad_astra_giselle_addon/recipes/compat/mekanism/crafting/module_acid_rain_proof_unit.json   配方（crafting_shaped）
/kubejs/data/industrialforegoing/recipes/creative_ingot.json                                             配方
/kubejs/data/avaritia/advancements/infinity/infinity_hoe.json                                            非配方（进度）
/kubejs/data/avaritia/advancements/stupid_dedication.json                                                非配方（进度）
/kubejs/data/kubejs/dimension/void_dim.json                                                              非配方（维度）
/kubejs/data/kubejs/loot_tables/blocks/omega_block.json                                                  非配方（战利品表）
/kubejs/data/kubejs/tags/items/botanypots/infinity_soil.json                                             非配方（标签）
```

**pc3——共 8 个 JSON，其中配方 3 条**（比 pc5 多一条）

```
… 上述 7 个之外，额外多出：
/kubejs/data/alltheores/recipes/brass_dust_from_alloy_blending.json                                      配方（crafting_shapeless）← 计数偏差源
```

`kubejs/` 下另有 4 个非配方 JSON（`assets`/`ressources` 的 blockstates 与模型），三份包完全一致，与配方计数无关。

### 3.3 时间戳残留 / 临时文件 / 验收遗留（要求 3）

| 包 | 带时间戳后缀的另存副本 | 其它临时/备份 |
| --- | --- | --- |
| pc3 | **无** | `PCL/config.v1.yml.bak`（启动器自带备份，非配方，pc5/pc7 同样存在） |
| **pc5** | **无** | 同上 |
| pc7（参照） | **有 1 个**：`recipe_studio/recipes/compat_…_20261031185835.json`（`20261031185835` = 2026-10-31 18:58:35） | 同上 |

**另有一处"内容型"遗留（三份包都有，需说明）**：同一份
`ad_astra_giselle_addon/…/module_acid_rain_proof_unit.json`
在三个包里内容不同，但**差异只有文件末尾一行测试标记键**：

| 包 | 标记键 |
| --- | --- |
| pc3 | `"_studioConflictMarker": "external"` |
| pc5 | `"_studioExternal": true` |
| pc7 | `"_studioMarker": "copy-case"` |

主体（`type` / `conditions` / `result` / `pattern` / `key`）**逐字节相同**，均为 **1 条完整的 `crafting_shaped` 配方**。
⇒ 该差异**不改变配方条数，也不产生 partial**（配方结构完整）。

### 3.4 是否有多余配方导致计数偏差（要求 4）

| 包 | 多余配方 | 类型 | 条数 | 后果 |
| --- | --- | --- | --- | --- |
| pc3 | `alltheores/recipes/brass_dust_from_alloy_blending.json` | `crafting_shapeless` | **+1** | recipes → **32,891** |
| pc5 | 无 | — | 0 | recipes → **32,890** |
| pc7 | `recipe_studio/recipes/…_20261031185835.json` | `crafting_shaped` | **+1** | recipes → **32,891**（已实测） |

两条多余配方都是 P-C3 / P-C7 阶段提交或另存测试留下的产物，**与本次 D 阶段无关**，也**未被本轮修改**。

### 3.5 能否在不扫描的前提下确认五项计数（要求 5）

**能给出高置信度判断，但不能替代实扫。** 推导链如下：

| # | 事实 | 来源 |
| --- | --- | --- |
| 1 | three packs 的 295 个 jar 同 inode | §3.1 实测 |
| 2 | `pc5` 的文件集 = `pc7` − 那 1 个另存副本，无其它增删 | §3.2 集合差 |
| 3 | 两者共有的 `kubejs/**` 内容差异仅 1 行标记键，配方条数不变 | §3.3 哈希 + 结构解析 |
| 4 | `pc7` 实测 recipes = **32,891**、types = 426、partial = 5,334、items = 43,474、icons = 38,760 | `PACK-07` §5 |
| 5 | 那条另存副本是 1 条 `minecraft:crafting_shaped`（已存在于 426 个类型中），且非 partial | §3.4 + PACK-07 的 partial 未因它变化 |

⇒ **`pc5` 预期：items 43,474 ／ icons 38,760 ／ recipes 32,890 ／ types 426 ／ partial 5,334**，五项与基准一致。

**残余不确定性与必须如实说明的部分**：

- 这是**文件级算术 + 同源字节**推出来的，不是扫描结果；
- 其中"标记键会被解析器忽略"这一点，**由 `pc7` 带着 `_studioMarker` 仍成功扫出且条数符合预期间接支持**，但并非对该键的显式测试；
- 因此若要求"实测确认"，仍需对 `pc5` 跑一次完整扫描（本轮按授权**未执行**）。

---

## 4. 三方差异总表（以 pc7 为参照）

| 差异 | pc7 独有 | pc3 独有 | pc5 独有 |
| --- | --- | --- | --- |
| 文件（相对路径） | `recipe_studio/…_20261031185835.json` | `alltheores/…/brass_dust_from_alloy_blending.json` | （无） |
| 共有文件内容不同 | 仅 `module_acid_rain_proof_unit.json` 的标记键 | 同左 | 同左 |

即：**pc5 是三份里唯一"没有多余配方文件、也没有另存副本"的包。**

---

## 5. 建议

1. **若批准复测 D-2，请指定 `pc5-pack-1112`**（只读使用，不写包内文件）。
   - 只需重跑"扫描 + 五项计数比对"，**D-1 不必重做**（已有 asar 探针实测证据）。
   - 预计耗时约 1 分钟扫描 + 启动/导入开销，总计 3 分钟内。
2. **不要用 pc3**：它的 extra 是 `crafting_shapeless`，同样会把 recipes 顶到 32,891。
3. **不要动 pc7 里的那个另存副本**：它是 P-C7 的验收证据，且已由 `P-OPT1` 明确标记"该副本不作为计数基线"。
4. 若你希望**彻底消除疑虑**，可选：批准我在复测时**同时**记录 `pc5` 的 `items.json` 条数与 `recipes:stats`，形成一份新的、干净的计数基线记录（仍然只读包、不写包）。

---

## 6. 本轮明确未做的事

- 未修改/删除/重命名/移动/覆盖任何包内文件（三份包均只读访问）。
- 未修改 `pc7-pack-1112` 中的另存副本。
- 未运行任何扫描、未创建用户数据目录。
- 未修改代码、依赖、打包配置、主台账（仍为 V5）、既有测试报告。
- 未改动 `REL-PKG` 任何状态。

**证据文件**：`.cache/pack-06/pack-compare.json`（完整清单与三方差集）、`.cache/pack-06/verify-packs.mjs`（核验脚本）、`.cache/pack-06/verify-packs.log`（输出）。
