import { FormEvent, KeyboardEvent, useMemo, useState } from "react";
import "./App.css";
import { ChatMessage, PlanState } from "./types";
import { createId, mockChatResponse, mockPlanResponse, mockRunPlan } from "./llm/mock";
import { realChatCompletion, realPlan, realRunPlan } from "./llm/httpClient";

const USE_HTTP_LLM = import.meta.env.VITE_USE_HTTP_LLM !== "false";

function App() {
  const [currentInput, setCurrentInput] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [planState, setPlanState] = useState<PlanState>({
    originalPrompt: null,
    steps: [],
    hasRun: false,
    planResult: null
  });
  const [lastPrompt, setLastPrompt] = useState<string>("");
  const [llmMode, setLlmMode] = useState<"http" | "mock">(USE_HTTP_LLM ? "http" : "mock");
  const [llmNotice, setLlmNotice] = useState<string>("");
  const [planWarning, setPlanWarning] = useState<string>("");
  const [isResponding, setIsResponding] = useState(false);
  const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);
  const [isRunningPlan, setIsRunningPlan] = useState(false);

  type DisplayBlock =
    | { type: "paragraph"; text: string }
    | { type: "list"; items: string[] }
    | { type: "section"; title: string; content: DisplayBlock[] };

  const toDisplayBlocks = (text: string): DisplayBlock[] => {
    const lines = text
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    
    const blocks: DisplayBlock[] = [];
    let currentList: string[] = [];
    let currentSection: { title: string; lines: string[] } | null = null;
    
    const bulletRegex = /^(\*|-|•|\d+[.)])/;
    const sectionRegex = /^(Day \d+|Evening \d+|Phase \d+|Step \d+|Week \d+|Section \d+|Meal Prep|Breakfast|Lunch|Dinner|Key Decisions|Assumptions|Notes|Conclusion)[\s:]*(.*)$/i;
    const keyDecisionsRegex = /^\*{2}(.*?)\*{2}$/;

    const flushList = () => {
      if (currentList.length) {
        blocks.push({ type: "list", items: currentList });
        currentList = [];
      }
    };

    const flushSection = () => {
      if (currentSection) {
        const sectionBlocks: DisplayBlock[] = [];
        let sectionList: string[] = [];
        
        currentSection.lines.forEach((line) => {
          if (bulletRegex.test(line)) {
            sectionList.push(line.replace(bulletRegex, "").trim());
          } else {
            if (sectionList.length) {
              sectionBlocks.push({ type: "list", items: sectionList });
              sectionList = [];
            }
            if (line) {
              sectionBlocks.push({ type: "paragraph", text: line });
            }
          }
        });
        
        if (sectionList.length) {
          sectionBlocks.push({ type: "list", items: sectionList });
        }
        
        blocks.push({
          type: "section",
          title: currentSection.title,
          content: sectionBlocks.length ? sectionBlocks : [{ type: "paragraph", text: "" }]
        });
        currentSection = null;
      }
    };

    lines.forEach((line) => {
      const sectionMatch = line.match(sectionRegex);
      
      if (sectionMatch) {
        flushList();
        flushSection();
        currentSection = { title: sectionMatch[1], lines: [] };
      } else if (currentSection) {
        // Bold/emphasized lines like **Key Decisions & Assumptions**
        if (keyDecisionsRegex.test(line)) {
          flushList();
          flushSection();
          currentSection = { title: line.replace(/\*{2}/g, ""), lines: [] };
        } else {
          currentSection.lines.push(line);
        }
      } else {
        // Not in a section
        if (bulletRegex.test(line)) {
          currentList.push(line.replace(bulletRegex, "").trim());
        } else {
          flushList();
          if (line) {
            blocks.push({ type: "paragraph", text: line });
          }
        }
      }
    });

    flushList();
    flushSection();
    
    return blocks.length ? blocks : [{ type: "paragraph", text }];
  };

  const planResultBlocks = planState.planResult ? toDisplayBlocks(planState.planResult) : [];

  const normalizeSteps = (steps: string[]): string[] => {
    const bullet = /^(\d+[.)]|[-*•])\s*/;
    return steps
      .map((text) => {
        // Remove bullet/numbering, stray quotes/commas, and JSON artifacts like `"steps": [`
        const cleaned = text
          .replace(bullet, "")
          .replace(/^"steps"\s*:\s*\[?/i, "")
          .replace(/^\s*"+/, "")
          .replace(/"+\s*$/, "")
          .replace(/^\s*,+/, "")
          .replace(/,+\s*$/, "")
          .trim();
        if (!cleaned || /^[\[{]\s*$/.test(cleaned)) return null;
        return cleaned ? cleaned : null;
      })
      .filter((s): s is string => Boolean(s));
  };

  const chatWithLLM = async (prompt: string): Promise<string> => {
    if (llmMode === "http") {
      try {
        return await realChatCompletion({ prompt });
      } catch (error) {
        console.error("HTTP LLM chat error", error);
        setLlmMode("mock");
        setLlmNotice("HTTP LLM failed; fell back to mock.");
      }
    }
    return mockChatResponse(prompt);
  };

  const FALLBACK_STEPS = [
    "Summarize the user goal and list key constraints",
    "Design core phases or journeys that satisfy constraints",
    "Outline tasks or features for each phase",
    "Plan validation/testing steps to check the solution in real life"
  ];

  const generatePlanSteps = async (prompt: string): Promise<string[]> => {
    if (llmMode === "http") {
      try {
        const steps = await realPlan(prompt);
        return steps.length ? steps : FALLBACK_STEPS;
      } catch (error) {
        console.error("HTTP LLM plan error", error);
        setLlmMode("mock");
        setLlmNotice("HTTP LLM failed; fell back to mock.");
      }
    }
    const mock = await mockPlanResponse(prompt);
    return mock.length ? mock : FALLBACK_STEPS;
  };

  const runPlanWithLLM = async (prompt: string, steps: string[]): Promise<string> => {
    if (llmMode === "http") {
      try {
        return await realRunPlan(prompt, steps);
      } catch (error) {
        console.error("HTTP LLM run-plan error", error);
        setLlmMode("mock");
        setLlmNotice("HTTP LLM failed; fell back to mock.");
      }
    }
    return mockRunPlan(prompt, steps);
  };

  const handleSend = async (e?: FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = currentInput.trim();
    if (!trimmed) return;

    const userMessage: ChatMessage = { id: createId(), role: "user", content: trimmed };
    setChatMessages((prev) => [...prev, userMessage]);
    setCurrentInput("");
    setLastPrompt(trimmed);
    setPlanState((prev) => ({ ...prev, planResult: null, hasRun: false }));
    setPlanWarning("");

    setIsResponding(true);
    setIsGeneratingPlan(true);

    try {
      const [assistantReply, generatedSteps] = await Promise.all([
        chatWithLLM(trimmed),
        generatePlanSteps(trimmed)
      ]);
      setChatMessages((prev) => [
        ...prev,
        { id: createId(), role: "assistant", content: assistantReply }
      ]);
      setPlanState({
        originalPrompt: trimmed,
        steps: normalizeSteps(generatedSteps),
        hasRun: false,
        planResult: null
      });
    } finally {
      setIsResponding(false);
      setIsGeneratingPlan(false);
    }
  };

  const handleRunPlan = async () => {
    if (!planState.originalPrompt || planState.steps.length === 0 || isRunningPlan) {
      setPlanWarning("Add at least one step before running.");
      return;
    }
    setPlanWarning("");
    setIsRunningPlan(true);
    setPlanState((prev) => ({ ...prev, planResult: null }));
    const prompt = planState.originalPrompt || lastPrompt || "your latest prompt";
    try {
      const result = await runPlanWithLLM(prompt, planState.steps);
      // Debug hook to inspect run-plan responses
      console.log("runPlan response", {
        prompt,
        steps: planState.steps,
        resultLength: result?.length ?? 0,
        result
      });
      setPlanState((prev) => ({ ...prev, planResult: result, hasRun: true }));
    } finally {
      setIsRunningPlan(false);
    }
  };

  const updateStepText = (id: string, text: string) => {
    setPlanState((prev) => {
      const idx = parseInt(id, 10);
      const steps = prev.steps.map((stepText, i) => (i === idx ? text : stepText));
      return { ...prev, steps, hasRun: false, planResult: null };
    });
  };

  const removeStep = (id: string) => {
    setPlanState((prev) => {
      const idx = parseInt(id, 10);
      const steps = prev.steps.filter((_, i) => i !== idx);
      return { ...prev, steps, hasRun: false, planResult: null };
    });
  };

  const addStep = () => {
    setPlanState((prev) => ({
      ...prev,
      originalPrompt: prev.originalPrompt ?? lastPrompt ?? "",
      steps: [...prev.steps, ""],
      hasRun: false,
      planResult: null
    }));
  };

  const moveStep = (id: string, direction: "up" | "down") => {
    setPlanState((prev) => {
      const idx = parseInt(id, 10);
      if (Number.isNaN(idx)) return prev;
      const target = direction === "up" ? idx - 1 : idx + 1;
      if (target < 0 || target >= prev.steps.length) return prev;
      const copy = [...prev.steps];
      [copy[idx], copy[target]] = [copy[target], copy[idx]];
      return { ...prev, steps: copy, hasRun: false, planResult: null };
    });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  const chatStatus = useMemo(() => {
    if (isResponding) return "Thinking...";
    return "";
  }, [isResponding]);

  const planStatus = useMemo(() => {
    if (isGeneratingPlan) return "Drafting plan...";
    if (isRunningPlan) return "Running plan...";
    return "";
  }, [isGeneratingPlan, isRunningPlan]);

  return (
    <div className="app-shell">
      <header className="top-bar">
        <div className="title">Plan-Edit vs Chat: Human-in-the-loop GenAI Demo</div>
        <div className="subtitle">
          Shared prompt sent to both panes for side-by-side comparison. Built to study where
          editable plans help (or fail) on everyday tasks.
        </div>
        <div className="mode-row">
          <div className={`mode-pill ${llmMode === "http" ? "live" : "mock"}`}>
            {llmMode === "http" ? "Connected to LLM proxy" : "Mock LLM"}
          </div>
          {llmNotice && <div className="mode-notice">{llmNotice}</div>}
        </div>
      </header>

      <main className="content">
        <section className="pane">
          <div className="pane-header">
            <div>
              <div className="pane-title">Standard Chat</div>
              <div className="pane-caption">Direct assistant reply without pre-planning</div>
            </div>
            {chatStatus && <div className="status-badge">{chatStatus}</div>}
          </div>
          <div className="chat-window">
            {chatMessages.length === 0 && (
              <div className="empty-state">Send a prompt to start the conversation.</div>
            )}
            {chatMessages.map((message) => (
              <div key={message.id} className={`message ${message.role}`}>
                <div className="message-role">{message.role === "user" ? "You" : "Assistant"}</div>
                <div className="message-content">{message.content}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="pane">
          <div className="pane-header">
            <div>
              <div className="pane-title">Plan-Edit Interface</div>
              <div className="pane-caption">See, edit, and run the plan before answering</div>
            </div>
            {planStatus && <div className="status-badge">{planStatus}</div>}
          </div>
          <div className="plan-panel">
            <div className="phase-label">Phase 1 · Edit the plan (steps the AI must follow)</div>
            {!planState.steps.length && !isGeneratingPlan ? (
              <div className="empty-state">Send a prompt to generate a plan.</div>
            ) : (
              <ol className="plan-list">
                {planState.steps.map((step, index) => (
                  <li key={index} className="plan-item">
                    <input
                      type="text"
                      value={step}
                      onChange={(e) => updateStepText(String(index), e.target.value)}
                      data-track="plan-step"
                      aria-label={`Plan step ${index + 1}`}
                    />
                    <div className="plan-actions">
                      <button
                        onClick={() => moveStep(String(index), "up")}
                        disabled={index === 0}
                        data-track="plan-move-up"
                      >
                        ↑
                      </button>
                      <button
                        onClick={() => moveStep(String(index), "down")}
                        disabled={index === planState.steps.length - 1}
                        data-track="plan-move-down"
                      >
                        ↓
                      </button>
                      <button onClick={() => removeStep(String(index))} data-track="plan-delete">
                        Delete
                      </button>
                    </div>
                  </li>
                ))}
              </ol>
            )}
            <div className="plan-controls">
              <button type="button" onClick={addStep} className="ghost" data-track="plan-add">
                + Add step
              </button>
              <button
                type="button"
                onClick={handleRunPlan}
                disabled={!planState.steps.length || isRunningPlan}
                data-track="plan-run"
              >
                {isRunningPlan ? "Running..." : "Run plan"}
              </button>
            </div>
            {planWarning && <div className="warning-text">{planWarning}</div>}
            {planState.hasRun && planState.planResult && (
              <>
                <div className="phase-label">Phase 2 · Execution result</div>
                <div className="plan-result message assistant">
                  <div className="message-role">Assistant</div>
                  <div className="message-content">
                    {planResultBlocks.map((block, idx) => {
                      if (block.type === "paragraph") {
                        return <p key={idx}>{block.text}</p>;
                      } else if (block.type === "list") {
                        return (
                          <ul key={idx}>
                            {block.items.map((item, itemIdx) => (
                              <li key={itemIdx}>{item}</li>
                            ))}
                          </ul>
                        );
                      } else if (block.type === "section") {
                        return (
                          <div key={idx} className="result-section">
                            <h4 className="section-title">{block.title}</h4>
                            <div className="section-content">
                              {block.content.map((subBlock, subIdx) => {
                                if (subBlock.type === "paragraph") {
                                  return <p key={subIdx}>{subBlock.text}</p>;
                                } else if (subBlock.type === "list") {
                                  return (
                                    <ul key={subIdx}>
                                      {subBlock.items.map((item, itemIdx) => (
                                        <li key={itemIdx}>{item}</li>
                                      ))}
                                    </ul>
                                  );
                                }
                                return null;
                              })}
                            </div>
                          </div>
                        );
                      }
                      return null;
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
        </section>
      </main>

      <form className="input-bar" onSubmit={handleSend}>
        <label className="input-label" htmlFor="shared-input">
          Shared prompt
        </label>
        <div className="input-row">
          <textarea
            id="shared-input"
            value={currentInput}
            onChange={(e) => setCurrentInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={2}
            data-track="shared-input"
            placeholder="Ask anything — it will go to both panes"
          />
          <button
            type="submit"
            disabled={!currentInput.trim() || isResponding || isGeneratingPlan}
            data-track="shared-send"
          >
            {isResponding || isGeneratingPlan ? "Working..." : "Send"}
          </button>
        </div>
        <div className="helper-text">
          Enter to send. Shift+Enter for newline. Set VITE_USE_HTTP_LLM=true and start the Node proxy
          to call a real open-source model. If the proxy fails, the app auto-falls back to the mock.
        </div>
      </form>
    </div>
  );
}

export default App;
