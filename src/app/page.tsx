"use client";

import { FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";

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

export default function HomePage() {
  const { toast } = useToast();
  const [destination, setDestination] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!destination.trim()) {
      toast({
        title: "请输入目的地",
        description: "例如：东京、成都、清迈等热门城市。",
        variant: "warning",
      });
      return;
    }

    setLoading(true);
    window.setTimeout(() => {
      setLoading(false);
      toast({
        title: "体验示例已生成",
        description: `${destination} 的三日行程建议已准备好，稍后可在「我的行程」查看。`,
        variant: "success",
      });
      setDestination("");
    }, 1200);
  };

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

        <form
          onSubmit={handleSubmit}
          className="rounded-3xl border border-border bg-surface/80 p-6 shadow-card backdrop-blur-sm"
        >
          <div className="flex flex-col gap-4 md:flex-row md:items-end">
            <Input
              label="想去哪里？"
              placeholder="目的地城市或区域"
              value={destination}
              onChange={(event) => setDestination(event.target.value)}
            />
            <Button type="submit" className="md:min-w-[160px]" loading={loading}>
              {loading ? (
                <>
                  <Spinner size="sm" />
                  规划中...
                </>
              ) : (
                "一键生成示例"
              )}
            </Button>
          </div>
          <p className="mt-3 text-xs text-muted">
            当前为演示流程，后续将接入真实 LLM 与数据库生成完整的行程数据。
          </p>
        </form>

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
        <h2 className="text-lg font-semibold">当前阶段重点</h2>
        <ul className="space-y-3 text-sm text-muted">
          <li>· 打造通用 UI 组件体系，确保后续功能开发一致性。</li>
          <li>· 预置主题色与排版基线，统一品牌调性。</li>
          <li>· 为接入 LLM、地图等模块预留组件扩展能力。</li>
        </ul>
        <div className="rounded-2xl bg-primary/10 p-4 text-sm text-primary">
          Tip：点击按钮可体验 Toast 通知，后续会与真实业务流程结合。
        </div>
      </aside>
    </section>
  );
}
