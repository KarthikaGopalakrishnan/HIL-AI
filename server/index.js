import express from "express";
import cors from "cors";

const app = express();
const port = process.env.PORT || 3001;

// Point this to your OpenAI-compatible endpoint (Ollama, LM Studio, vLLM, etc.)
const LLM_URL =
  process.env.LLM_URL || "http://localhost:11434/v1/chat/completions";
const LLM_MODEL = process.env.LLM_MODEL || "llama3";

app.use(cors());
app.use(express.json());

async function callChat(prompt) {
  const response = await fetch(LLM_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: LLM_MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.4,
      max_tokens: 900,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`LLM error ${response.status}: ${text}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content ?? "No response from model.";
}

app.post("/api/chat", async (req, res) => {
  try {
    const prompt = req.body?.prompt ?? "";
    const content = await callChat(prompt);
    res.json({ content });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const toStepsFromLines = (text) => {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const items = [];
  const bullet = /^(\d+[.)]|[-*•])\s*/;

  for (const line of lines) {
    if (/^here (are|is)\b/i.test(line) || /^proposed/i.test(line)) continue;
    if (/^"?\s*steps"?\s*:/i.test(line)) continue;
    if (/^[\[{]\s*$/.test(line)) continue;

    const cleaned = line.replace(bullet, "").trim();
    if (!cleaned) continue;
    items.push(cleaned);
  }

  return items.length
    ? items
    : [
        "Summarize the user's goal and key constraints",
        "Design core phases/journeys that satisfy those constraints",
        "Outline concrete tasks/features per phase",
        "Add validation/testing steps to ensure it works in real life",
      ];
};

const coerceStep = (entry) => {
  if (typeof entry === "string") return entry;
  if (entry && typeof entry === "object") {
    const candidate =
      entry.text ||
      entry.content ||
      entry.title ||
      entry.description ||
      entry.step ||
      entry.value;
    if (candidate) return String(candidate);
  }
  return String(entry ?? "");
};

app.post("/api/plan", async (req, res) => {
  try {
    const prompt = req.body?.prompt ?? "";

    const planPrompt = `You are a planning assistant. Given the user’s request, break it into 4–8 SHORT, concrete steps that capture the most important constraints and structure.

Return ONLY valid JSON:
{
  "steps": [
    "Summarize the user’s goal and extract key constraints (time windows, counts, diets, budgets, must/avoid items)",
    "Design core phases/journeys that satisfy those constraints (with ordering or grouping as needed)",
    "Outline concrete tasks/features per phase, reflecting the constraints",
    "Add validation/testing steps to ensure the solution works in real life"
  ]
}

Rules:
- 4–8 steps max.
- Each step is a SHORT imperative action (max 18 words).
- Steps must reflect key constraints in the prompt (time windows, diets, durations, number of days, must/avoid, etc.).
- NO introductions, explanations, markdown, or extra fields.
- Do NOT output phrases like 'Here are the steps'.
- Output must be valid JSON, nothing before or after.
User request: ${prompt}`;

    const planText = await callChat(planPrompt);

    const parseJsonSteps = (raw) => {
      try {
        let candidate = null;

        // Try direct parse
        try {
          candidate = JSON.parse(raw);
        } catch (_) {
          // Try to extract first JSON block
          const match = raw.match(/\{[\s\S]*\}/);
          if (match) {
            candidate = JSON.parse(match[0]);
          }
        }

        if (candidate && Array.isArray(candidate.steps)) {
          return candidate.steps.map((s) => coerceStep(s));
        }
      } catch (_) {
        // fall through
      }
      return null;
    };

    const jsonSteps = parseJsonSteps(planText);
    const listSteps = jsonSteps ?? toStepsFromLines(planText);

    const steps = listSteps.map((text) => text.replace(/^[0-9.\s]+/, ""));
    res.json({ steps });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/run-plan", async (req, res) => {
  try {
    const prompt = req.body?.prompt ?? "";
    const steps = Array.isArray(req.body?.steps) ? req.body.steps : [];

    const bulletSteps = steps
      .map((s) => {
        const text = typeof s === "string" ? s : s?.text ?? "";
        return `- ${text}`;
      })
      .join("\n");

    const runPrompt = `The user previously asked:

${prompt}

They have now also provided some additional constraints / corrections that they want the answer to respect:
${bulletSteps}

Please answer the user's original request again, in the same style and level of detail you would normally use in a regular chat response.

Requirements:
- Treat the bullet list above as hard constraints or clarifications from the user.
- Use them to adjust or refine your answer, but otherwise respond exactly as you would to the original prompt.
- Do NOT mention the words "steps", "plan", or "constraints list".
- Do NOT describe the editing process.
- Just give a single, coherent answer that naturally satisfies both the original request and the bullets above.`;

    const content = await callChat(runPrompt);
    res.json({ result: content });
  } catch (error) {
    res.status(500).json({ error: error.message ?? "Unknown error" });
  }
});

app.listen(port, () => {
  console.log(`LLM proxy listening on http://localhost:${port}`);
});
