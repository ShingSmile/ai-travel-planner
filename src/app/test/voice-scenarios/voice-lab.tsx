"use client";

import { useMemo, useState } from "react";
import { VoiceRecorder } from "@/components/voice/voice-recorder";
import { TextArea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { getPlaywrightBypassToken } from "@/lib/test-flags";

export function VoiceScenarioLab() {
  const bypassToken = useMemo(() => getPlaywrightBypassToken() ?? "playwright-bypass-token", []);

  const [notes, setNotes] = useState("");
  const [expenseForm, setExpenseForm] = useState({
    category: "",
    amount: "",
    currency: "",
    source: "",
    memo: "",
  });

  return (
    <main className="mx-auto max-w-4xl space-y-12 p-8">
      <header className="space-y-3">
        <h1 className="text-2xl font-semibold text-foreground">语音识别测试场景</h1>
        <p className="text-sm text-muted">
          本页面仅用于端到端测试，复现行程备注与费用录入场景，依赖 Playwright bypass token。
        </p>
      </header>

      <section className="space-y-4 rounded-3xl border border-border bg-surface p-6 shadow-card">
        <h2 className="text-lg font-semibold text-foreground">行程备注语音录入</h2>
        <p className="text-sm text-muted">
          模拟新建行程页面中通过语音补充备注的流程，识别结果将自动附加到文本框。
        </p>
        <VoiceRecorder
          sessionToken={bypassToken}
          meta={{ purpose: "trip_notes" }}
          onRecognized={(payload) => {
            if (!payload?.transcript) return;
            setNotes((prev) => {
              if (!prev.trim()) {
                return payload.transcript;
              }
              return `${prev.trim()}\n${payload.transcript}`;
            });
          }}
        />
        <TextArea
          label="行程备注"
          placeholder="识别成功后将在此处展示转写内容"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </section>

      <section className="space-y-4 rounded-3xl border border-border bg-surface p-6 shadow-card">
        <h2 className="text-lg font-semibold text-foreground">费用语音录入</h2>
        <p className="text-sm text-muted">
          模拟费用面板的语音录入，识别成功后将根据意图填充分类、金额等字段，失败时展示错误提示。
        </p>
        <VoiceRecorder
          sessionToken={bypassToken}
          meta={{ purpose: "expense", tripId: "test-trip" }}
          onRecognized={(payload) => {
            setExpenseForm((prev) => ({
              category: payload.expenseDraft?.category ?? prev.category,
              amount:
                payload.expenseDraft?.amount !== undefined
                  ? String(payload.expenseDraft.amount)
                  : prev.amount,
              currency: payload.expenseDraft?.currency ?? prev.currency,
              source: payload.expenseDraft?.source ?? prev.source,
              memo:
                payload.expenseDraft?.memo ??
                (payload.transcript
                  ? prev.memo
                    ? `${prev.memo}\n${payload.transcript}`
                    : payload.transcript
                  : prev.memo),
            }));
          }}
        />
        <div className="grid gap-4 md:grid-cols-2">
          <Input
            label="费用类别"
            placeholder="餐饮 / 住宿 ..."
            value={expenseForm.category}
            onChange={(event) =>
              setExpenseForm((prev) => ({ ...prev, category: event.target.value }))
            }
          />
          <Input
            label="金额"
            value={expenseForm.amount}
            onChange={(event) =>
              setExpenseForm((prev) => ({ ...prev, amount: event.target.value }))
            }
          />
          <Input
            label="币种"
            value={expenseForm.currency}
            onChange={(event) =>
              setExpenseForm((prev) => ({ ...prev, currency: event.target.value }))
            }
          />
          <Input
            label="来源"
            value={expenseForm.source}
            onChange={(event) =>
              setExpenseForm((prev) => ({ ...prev, source: event.target.value }))
            }
          />
        </div>
        <TextArea
          label="费用备注"
          placeholder="识别的原文将记录在此处，便于校对。"
          value={expenseForm.memo}
          onChange={(event) => setExpenseForm((prev) => ({ ...prev, memo: event.target.value }))}
        />
      </section>
    </main>
  );
}
