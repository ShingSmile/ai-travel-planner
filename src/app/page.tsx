"use client";

const featureList = [
  {
    title: "智能路线规划",
    description: "结合偏好、预算与行程节奏，自动生成逐日路线与交通建议。",
  },
  {
    title: "实时预算提醒",
    description: "同步费用记录，超出阈值即时通知，随时掌握支出动态。",
  },
  {
    title: "语音速记助手",
    description: "一键录音转文字，快速添加想去的景点或事项，自动归档。",
  },
];

const guideSteps = [
  {
    label: "探索阶段",
    labelColor: "text-sky-500",
    title: "挑选目的地",
    description: "浏览灵感、收藏清单或直接输入城市，系统会记录你想要的旅行节奏与预算基线。",
    accent: "from-sky-400/20 via-sky-500/5 to-transparent",
    tags: ["灵感清单", "时间范围", "同行偏好"],
  },
  {
    label: "创作阶段",
    labelColor: "text-purple-500",
    title: "生成智慧行程",
    description: "LLM 结合既有景点库与实时数据，自动输出每日路线、交通与备选活动。",
    accent: "from-purple-500/20 via-purple-500/5 to-transparent",
    tags: ["LLM + DB", "交通提示", "备选方案"],
  },
  {
    label: "协作阶段",
    labelColor: "text-emerald-500",
    title: "同步与调整",
    description: "在地图、移动端或语音助手中修改，所有成员实时同步，预算与提醒自动更新。",
    accent: "from-emerald-500/20 via-emerald-500/5 to-transparent",
    tags: ["语音速记", "实时同步", "预算监控"],
  },
];

const highlightSections = [
  {
    kicker: "地图联动",
    title: "卡片与路线保持同频",
    description:
      "在时间轴中点击活动，可立即在地图上显示对应坐标、交通方式与步行路径，方便快速确认动线。",
    accent: "border-primary/30 bg-primary/5",
    bullets: ["支持多日标签切换", "可见交通段落的拥挤情况"],
  },
  {
    kicker: "语音 & 识别",
    title: "语音速记自动归档",
    description: "边走边录音，系统实时转文字并建议插入位置；你只需确认即可落地到行程卡片。",
    accent: "border-emerald-300/50 bg-emerald-50/30",
    bullets: ["连续录音最长 45 秒", "支持口头预算提醒"],
  },
  {
    kicker: "费用守护",
    title: "预算阈值提醒更灵活",
    description: "达到阈值时提醒 + 推荐替代方案，支持把高价活动标记为“稍后确认”。",
    accent: "border-orange-300/50 bg-orange-50/30",
    bullets: ["按项目/整日独立阈值", "可快速导出费用概览"],
  },
];

export default function HomePage() {
  return (
    <section className="grid gap-12 lg:grid-cols-[1.2fr_1fr] lg:items-start">
      <div className="space-y-10">
        <div className="space-y-6">
          <span className="inline-flex items-center rounded-full bg-primary/10 px-4 py-1 text-sm font-medium text-primary">
            AI 旅行规划师 · 项目预览
          </span>
          <h1 className="max-w-2xl text-4xl font-semibold leading-tight md:text-5xl">
            几分钟内生成可信赖的旅行计划，从行程安排到预算管理一应俱全。
          </h1>
          <p className="max-w-2xl text-base text-muted md:text-lg">
            通过将 LLM 行程生成、高德地图、Supabase Realtime
            与语音识别整合在一起，为旅行者提供可执行、可调整、可同步的规划体验。
          </p>
        </div>

        <div className="rounded-3xl border border-border bg-surface/80 p-6 shadow-card backdrop-blur-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
                使用指南
              </p>
              <h2 className="mt-1 text-2xl font-semibold leading-tight">
                三个步骤，完成一次可信赖的旅行规划
              </h2>
            </div>
            <div className="rounded-full border border-primary/30 px-3 py-1 text-xs text-primary">
              在产品 Beta 中持续完善
            </div>
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {guideSteps.map((step) => (
              <article
                key={step.title}
                className={`flex flex-col gap-4 rounded-2xl border border-border/60 bg-gradient-to-br ${step.accent} p-5 shadow-sm`}
              >
                <div className={`flex items-center gap-2 text-xs font-semibold ${step.labelColor}`}>
                  <span className="h-1.5 w-1.5 rounded-full bg-current" />
                  {step.label}
                </div>
                <div>
                  <h3 className="text-base font-semibold">{step.title}</h3>
                  <p className="mt-2 text-sm text-muted">{step.description}</p>
                </div>
                <div className="mt-auto flex flex-wrap gap-2">
                  {step.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full border border-border/70 bg-surface/90 px-3 py-1 text-xs text-muted"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {featureList.map((feature) => (
            <article
              key={feature.title}
              className="rounded-3xl border border-border bg-surface/70 p-5 shadow-card backdrop-blur-sm transition hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg"
            >
              <h3 className="text-base font-semibold text-foreground">{feature.title}</h3>
              <p className="mt-2 text-sm text-muted">{feature.description}</p>
            </article>
          ))}
        </div>
      </div>

      <aside className="space-y-6 rounded-3xl border border-dashed border-border/70 bg-surface/70 p-6 shadow-card backdrop-blur-sm">
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">操作亮点</h2>
          <p className="text-sm text-muted">
            在地图、LLM 与语音模块间自由切换，保持同一份行程实时同步。挑选感兴趣的功能，直接在 Beta
            版中体验：
          </p>
        </div>
        <div className="space-y-4">
          {highlightSections.map((section) => (
            <article
              key={section.title}
              className={`rounded-2xl border ${section.accent} p-5 shadow-sm`}
            >
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">
                {section.kicker}
              </p>
              <h3 className="mt-2 text-base font-semibold">{section.title}</h3>
              <p className="mt-2 text-sm text-muted">{section.description}</p>
              <ul className="mt-3 space-y-1 text-xs text-muted">
                {section.bullets.map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary/50" />
                    {item}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
        <p className="text-xs text-muted">
          小贴士：可在「行程规划」页直接录音记笔记，系统会自动归档到对应日期。
        </p>
      </aside>
    </section>
  );
}
