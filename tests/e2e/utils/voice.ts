import type { Page, Route } from "@playwright/test";

export async function setupMediaRecorderMocks(page: Page) {
  await page.addInitScript(() => {
    class FakeMediaStream {
      getTracks() {
        return [
          {
            stop() {
              /* noop */
            },
          },
        ];
      }
    }

    class FakeMediaRecorder extends EventTarget {
      public mimeType: string;
      public state: "inactive" | "recording" = "inactive";
      private chunk: Blob | null = null;

      constructor(stream: FakeMediaStream, options?: MediaRecorderOptions) {
        super();
        void stream;
        this.mimeType = options?.mimeType ?? "audio/webm";
      }

      static isTypeSupported() {
        return true;
      }

      start() {
        this.state = "recording";
        this.chunk = new Blob(["mock audio content"], { type: this.mimeType });
      }

      stop() {
        if (this.state === "inactive") return;
        this.state = "inactive";

        const dataEvent = new Event("dataavailable");
        Object.defineProperty(dataEvent, "data", {
          value: this.chunk ?? new Blob(["mock"], { type: this.mimeType }),
        });
        this.dispatchEvent(dataEvent);

        const stopEvent = new Event("stop");
        this.dispatchEvent(stopEvent);
      }
    }

    Object.defineProperty(window, "MediaRecorder", {
      configurable: true,
      writable: true,
      value: FakeMediaRecorder,
    });

    if (!navigator.mediaDevices) {
      Object.defineProperty(navigator, "mediaDevices", {
        configurable: true,
        writable: true,
        value: {},
      });
    }

    navigator.mediaDevices.getUserMedia = async () => new FakeMediaStream();
  });
}

interface MockVoiceData {
  voiceInputId?: string;
  transcript?: string;
  intent?: string;
  expenseDraft?: Record<string, unknown> | null;
  tripIntent?: Record<string, unknown> | null;
}

export async function mockVoiceSuccess(route: Route, data?: MockVoiceData) {
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      success: true,
      data: {
        voiceInputId: data?.voiceInputId ?? "voice-mock-success",
        transcript: data?.transcript ?? "mock transcript",
        intent: data?.intent ?? "trip_notes",
        expenseDraft: data?.expenseDraft ?? null,
        tripIntent: data?.tripIntent ?? null,
      },
    }),
  });
}

export async function mockVoiceFailure(route: Route, message: string) {
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      success: false,
      error: {
        message,
        code: "voice_provider_error",
      },
    }),
  });
}
