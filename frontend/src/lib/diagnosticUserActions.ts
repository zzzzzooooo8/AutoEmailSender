import { recordDiagnosticEvent, type DiagnosticEventInput } from "@/lib/diagnostics";

interface UserActionDiagnosticInput {
  eventName: string;
  data?: unknown;
  message?: string;
  level?: "info" | "warn" | "error";
}

export function safeRecordUserAction({
  eventName,
  data,
  message,
  level = "info",
}: UserActionDiagnosticInput): void {
  try {
    const input: DiagnosticEventInput = {
      level,
      category: "user_action",
      eventName,
    };
    if (message !== undefined) {
      input.message = message;
    }
    if (data !== undefined) {
      input.data = data;
    }
    recordDiagnosticEvent(input);
  } catch {
    // Diagnostic recording must never block the user flow.
  }
}
