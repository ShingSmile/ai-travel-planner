import { notFound } from "next/navigation";
import { Suspense } from "react";
import { VoiceScenarioLab } from "./voice-lab";

export default function VoiceScenariosPage() {
  const bypassEnabled =
    process.env.NODE_ENV !== "production" &&
    Boolean(
      (
        process.env.NEXT_PUBLIC_PLAYWRIGHT_BYPASS_AUTH ??
        process.env.PLAYWRIGHT_BYPASS_AUTH ??
        ""
      ).trim()
    );

  if (!bypassEnabled) {
    notFound();
  }

  return (
    <Suspense fallback={null}>
      <VoiceScenarioLab />
    </Suspense>
  );
}
