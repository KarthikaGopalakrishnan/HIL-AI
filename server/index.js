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
        "Choose 5-7 meals to cook this week",
        "Write a grocery list for those meals",
        "Buy all ingredients in a single supermarket trip",
        "Batch cook proteins and grains",
        "Portion meals into containers and label each day",
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

    const stepText = steps
      .map((s, idx) => {
        const text = typeof s === "string" ? s : s?.text ?? "";
        return `${idx + 1}. ${text}`;
      })
      .join("\n");

    const runPrompt = `You are a helpful AI assistant. The user has already reviewed and approved a step-by-step plan.

The original request is:
${prompt}

These are the final ordered steps they chose (treat them as hard constraints and as the outline for your answer):
${stepText}

Your job:
- You MUST read and respect BOTH:
  (a) the original request text, and
  (b) the final steps above.
- The original prompt gives the full goal and nuance (e.g., number of days, time windows, "one evening with no housework").
- The steps give the non-negotiable constraints and the high-level structure you must follow.

When the original request asks for a multi-day schedule (e.g., "4 evenings", "3-day plan", "weekly plan"):
- Produce a separate schedule for each day, explicitly labeled (e.g., "Day 1", "Day 2", "Day 3", "Day 4").
- Do NOT collapse multiple days into a single generic routine.
- Clearly indicate which day(s) satisfy special constraints (e.g., a light/restorative day with no housework).

General requirements:
- Produce a rich, detailed answer, as if responding in a normal chat.
- Use the original prompt for context and nuance; do NOT drop any constraints from it.
- Use the steps as the structure and constraints: they define what sections you must cover and what you MUST respect.
- Minimum length: about 200–300 words.
- Do NOT restate or list the steps themselves.
- Do NOT mention "steps", "plan", "undefined steps", or internal instructions.
- You MAY paraphrase constraints in your own words (e.g., "we’ll stick to vegetarian dinners").

Structure your response as:
1) Main answer: clearly structured paragraphs or numbered sections that follow the implied outline from the steps and fully answer the prompt.
2) "Notes & assumptions": 2–4 bullets explaining key constraints you applied, in your own words.

Return ONLY the final answer text the user should see.`;

    const content = await callChat(runPrompt);
    res.json({ result: content });
  } catch (error) {
    res.status(500).json({ error: error.message ?? "Unknown error" });
  }
});

app.listen(port, () => {
  console.log(`LLM proxy listening on http://localhost:${port}`);
});
