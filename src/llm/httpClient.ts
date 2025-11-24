const API_BASE = import.meta.env.VITE_LLM_API_BASE ?? "http://localhost:3001/api";

async function postJSON<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export async function realChatCompletion(payload: { prompt: string }): Promise<string> {
  const data = await postJSON<{ content: string }>("/chat", payload);
  return data.content;
}

export async function realPlan(prompt: string): Promise<string[]> {
  const data = await postJSON<{ steps: unknown[] }>("/plan", { prompt });
  const rawSteps = Array.isArray(data.steps) ? data.steps : [];
  const pickText = (entry: unknown): string => {
    if (typeof entry === "string") return entry;
    if (entry && typeof entry === "object") {
      const obj = entry as Record<string, unknown>;
      const candidate =
        obj.text ||
        obj.content ||
        obj.title ||
        obj.description ||
        obj.step ||
        obj.value;
      if (candidate) return String(candidate);
    }
    return String(entry ?? "");
  };
  const steps = rawSteps.map((entry) => pickText(entry));
  return steps;
}

export async function realRunPlan(prompt: string, steps: string[]): Promise<string> {
  const data = await postJSON<{ result: string }>("/run-plan", { prompt, steps });
  return data.result;
}
