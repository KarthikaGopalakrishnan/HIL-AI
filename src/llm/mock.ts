import { PlanStep } from "../types";

const randomDelay = () => 400 + Math.random() * 500;

const newId = () => crypto.randomUUID?.() ?? Math.random().toString(36).slice(2);

const sampleVerbs = ["Analyze", "Outline", "Draft", "Review", "Refine", "Summarize"];
const sampleFinishes = [
  "highlighting key trade-offs",
  "keeping it concise",
  "with an example",
  "noting assumptions",
  "with clear bullet points"
];

export async function mockChatResponse(prompt: string): Promise<string> {
  const trimmed = prompt.trim();
  const summary = trimmed.slice(0, 80) || "your request";
  const finishing = sampleFinishes[Math.floor(Math.random() * sampleFinishes.length)];
  const message = `Here's a quick take on "${summary}": focus on the main intent, provide 2-3 crisp points, and close ${finishing}.`;
  return new Promise((resolve) => setTimeout(() => resolve(message), randomDelay()));
}

export async function mockPlanResponse(prompt: string): Promise<string[]> {
  const core = prompt.trim() || "the question";
  const verbs = [...sampleVerbs].sort(() => 0.5 - Math.random()).slice(0, 3);
  const steps: string[] = verbs.map((verb, index) => `${index + 1}. ${verb} ${core}`);
  if (steps.length === 0) {
    steps.push(`Review ${core}`);
  }
  return new Promise((resolve) => setTimeout(() => resolve(steps), randomDelay()));
}

export async function mockRunPlan(prompt: string, steps: PlanStep[] | string[]): Promise<string> {
  const list = steps as any[];
  const summary = list
    .map((s: any, idx) => {
      const text = typeof s === "string" ? s : s?.text ?? "";
      return `${idx + 1}) ${text.toString().replace(/^[0-9]+\\.\\s*/, "")}`;
    })
    .join("; ");
  const base = prompt.trim() || "the prompt";
  const finishing = sampleFinishes[Math.floor(Math.random() * sampleFinishes.length)];
  const message = `Ran plan for "${base}". Steps: ${summary}. Result: coherent answer ${finishing}.`;
  return new Promise((resolve) => setTimeout(() => resolve(message), randomDelay()));
}

export function createId() {
  return newId();
}
