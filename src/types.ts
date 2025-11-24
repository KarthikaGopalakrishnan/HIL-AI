export type ChatMessage = { id: string; role: "user" | "assistant"; content: string };

export type PlanStep = { id: string; text: string };

export type PlanState = {
  originalPrompt: string | null;
  steps: string[];
  hasRun: boolean;
  planResult: string | null;
};
