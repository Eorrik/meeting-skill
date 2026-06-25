# 飞书会议纪要 XML 模板与规范

## 一、文档整体结构（固定顺序，缺一不可）

```xml
<title>智能纪要：{会议主题} {YYYY年M月D日}</title>

<!-- 元数据引用块 -->
<blockquote><p>录音时间：{YYYY年M月D日（周X）} {HH:MM} - {HH:MM}</p></blockquote>
<blockquote><p>参与人员：{我司：姓名1、姓名2……}  {客户方：姓名1、姓名2……}</p></blockquote>

<p></p>

<h1>总结</h1>

<!-- 必须：飞书画板（由 SubAgent 生成 SVG 插入）-->
<whiteboard type="svg">
  <!-- SVG 内容见第三节 -->
</whiteboard>

<!-- 一句话背景概述 -->
<p>{会议核心议题一句话概括}，内容如下：</p>

<!-- 主体：分主题要点列表 -->
<ul>
  <li><b>{主题一标题}</b>
    <!-- 可选：双栏网格（左文右图）-->
    <grid>
      <column width-ratio="0.57">
        <ul><li>...</li></ul>
      </column>
      <column width-ratio="0.43">
        <img name="..." caption="..." src="..."/>
      </column>
    </grid>
    <ul><li>...</li></ul>
  </li>
  <li><b>{主题二标题}</b>
    <ul>
      <li><b>{子主题}</b><ul><li>...</li></ul></li>
    </ul>
  </li>
</ul>

<p></p>

<h1>待办</h1>
<checkbox done="false">{待办人}：{行动描述，含完成标准和截止条件}</checkbox>
```

---

## 二、内容提炼规则

### 主题拆分
- 从原文提炼 **3-5 个主题模块**，以参会人讨论的核心议题命名（非流水账）
- 每个主题 2-3 层嵌套，不超过 4 层
- 第一层 `<li>` 使用 `<b>` 粗体标注主题名
- 第二层标注子主题，也用 `<b>` 加粗
- 第三层是具体要点，不加粗

### 信息密度
- 原文口语化内容**去噪提炼**：去除填充词、重复表达、无意义寒暄
- 每条要点是一个**完整的信息单元**，可独立阅读
- 数字、比例、时间节点必须**保留原值**（如"90%以上"、"2000个样本"、"2万元/台"）

### 双栏网格触发条件
在以下情况插入 `<grid>` 双栏布局（左文右图）：
1. **决策对比**：两种方案/模式的对比（grid 比纯文字清晰10倍）
2. **流程步骤**：后续推进步骤图
3. **架构/关系图**：技术架构、合作关系图示

grid 列宽参考：
- 标准（左文右图）：`width-ratio="0.57"` / `width-ratio="0.43"`
- 居中图片（留边距）：三列 `0.06` / `0.87` / `0.07`

> **注意**：grid 里的图片 `src` 是飞书 token，由 `+media-insert` 上传后获得。如果本次无法生成图片，使用纯文字表格替代。

---

## 三、开篇画板 SVG 设计规范

开篇画板是整份纪要的"封面摘要图"，使用 SVG 绘制，插入到 `<h1>总结</h1>` 之后。

### 画板内容
- 展示会议的 **核心结论/决策树/关键路径**，而非复述文字
- 推荐形式：
  - **模式对比图**（两列）：适合"两种方案比较"类会议
  - **流程决策图**（横向箭头）：适合"下一步行动"类会议
  - **关系图**（中心辐射）：适合"多方合作/生态"类会议

### SVG 规格
```
viewBox: 0 0 760 320
背景色: #F0F4FF（浅蓝）或 #F5F5F5（浅灰）
主色: #3B5BDB（蓝）、#2F9E44（绿）、#E67700（橙）、#C92A2A（红）
字体: font-family="PingFang SC, Microsoft YaHei, sans-serif"
圆角卡片: rx="10"
箭头: marker-end="url(#arrow)"
标题区: 顶部矩形，深色背景白字，高 48px
```

### SVG 模板（模式对比图）

```svg
<svg viewBox="0 0 760 320" xmlns="http://www.w3.org/2000/svg" font-family="PingFang SC,Microsoft YaHei,sans-serif">
  <defs>
    <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="#555"/>
    </marker>
  </defs>
  <!-- 背景 -->
  <rect width="760" height="320" fill="#F0F4FF" rx="12"/>
  <!-- 标题栏 -->
  <rect width="760" height="48" fill="#3B5BDB" rx="12"/>
  <rect y="36" width="760" height="12" fill="#3B5BDB"/>
  <text x="380" y="30" text-anchor="middle" fill="white" font-size="16" font-weight="bold">{标题文字}</text>
  <!-- 左卡片 -->
  <rect x="40" y="72" width="300" height="220" fill="white" rx="10" stroke="#C5D5FF" stroke-width="1.5"/>
  <rect x="40" y="72" width="300" height="36" fill="#4C6EF5" rx="10"/>
  <rect x="40" y="96" width="300" height="12" fill="#4C6EF5"/>
  <text x="190" y="94" text-anchor="middle" fill="white" font-size="13" font-weight="bold">{左标题}</text>
  <!-- 右卡片 -->
  <rect x="420" y="72" width="300" height="220" fill="white" rx="10" stroke="#C5D5FF" stroke-width="1.5"/>
  <rect x="420" y="72" width="300" height="36" fill="#2F9E44" rx="10"/>
  <rect x="420" y="96" width="300" height="12" fill="#2F9E44"/>
  <text x="570" y="94" text-anchor="middle" fill="white" font-size="13" font-weight="bold">{右标题}</text>
  <!-- VS 连接 -->
  <text x="380" y="186" text-anchor="middle" fill="#868E96" font-size="22" font-weight="bold">VS</text>
  <!-- 左内容（每行约 y+=28） -->
  <text x="60" y="130" fill="#333" font-size="12">• {要点1}</text>
  <text x="60" y="158" fill="#333" font-size="12">• {要点2}</text>
  <text x="60" y="186" fill="#333" font-size="12">• {要点3}</text>
  <!-- 右内容 -->
  <text x="440" y="130" fill="#333" font-size="12">• {要点1}</text>
  <text x="440" y="158" fill="#333" font-size="12">• {要点2}</text>
  <text x="440" y="186" fill="#333" font-size="12">• {要点3}</text>
</svg>
```

### 其他画板类型

**流程步骤图（横向箭头）**：适合"后续行动计划"
```
[步骤1框] → [步骤2框] → [步骤3框] → [步骤4框]
每框宽140px，高60px，间距20px，箭头连接
顶部标题：{会议核心行动路径}
```

**关系图（中心辐射）**：适合"多方合作"
```
中心圆：{核心合作点}
辐射节点：{各参与方角色} + 连线标注各自贡献
```

---

## 四、待办清单规则

- 只提炼 **明确的、有责任方的行动项**（"下次再谈"不算）
- 每条待办格式：`{责任方}：{动作}，包括 {内容范围}，验收标准：{完成判断依据}`
- 一份纪要通常 1-3 条待办，不超过 5 条
- 使用 `<checkbox done="false">` 标签

---

## 五、禁忌

| 禁止 | 原因 |
|------|------|
| 纯流水账（按时间顺序复述） | 失去提炼价值 |
| 超过 5 层嵌套 | 飞书渲染混乱 |
| 在 `<grid>` 外使用图片 | 排版会乱 |
| 忽略数字/比例/金额 | 丢失关键信息 |
| 待办写模糊动词（"继续沟通"） | 无法执行 |
| 画板 SVG 超过 800px 宽 | 飞书截断 |
