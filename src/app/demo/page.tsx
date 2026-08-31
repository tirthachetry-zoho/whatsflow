"use client";

import { useState, useRef, useEffect } from "react";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface Step {
  id: string;
  type: string;
  label: string;
  detail?: string;
  status: string;
}

export default function DemoPage() {
  const [businessSlug, setBusinessSlug] = useState("demo-restaurant");
  const [messages, setMessages] = useState<Message[]>([]);
  const [steps, setSteps] = useState<Step[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionId] = useState(() => `demo-${Date.now()}`);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage(text: string) {
    if (!text.trim() || loading) return;

    const userMsg: Message = { id: `u-${Date.now()}`, role: "user", content: text.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/demo/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessSlug, sessionId, message: text.trim() }),
      });
      const data = await res.json();

      if (data.ok && data.data.messages) {
        const assistantMsgs: Message[] = data.data.messages
          .filter((m: { role: string }) => m.role === "assistant")
          .map((m: { id: string; content: string }) => ({
            id: m.id,
            role: "assistant" as const,
            content: m.content,
          }));
        setMessages((prev) => [...prev, ...assistantMsgs]);
        setSteps(data.data.steps ?? []);
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { id: `e-${Date.now()}`, role: "assistant", content: "⚠️ Error connecting to the engine. Make sure the dev server is running." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <div className="bg-white dark:bg-gray-900 border-b px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <a href="/" className="text-xl">💚</a>
          <h1 className="text-lg font-semibold">Freebuff Demo</h1>
        </div>
        <select
          value={businessSlug}
          onChange={(e) => { setBusinessSlug(e.target.value); setMessages([]); setSteps([]); }}
          className="px-3 py-1.5 border rounded-lg text-sm bg-white dark:bg-gray-800"
        >
          <option value="demo-restaurant">🍽️ Demo Restaurant</option>
          <option value="demo-dental-clinic">🦷 Demo Dental Clinic</option>
        </select>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Chat Panel */}
        <div className="flex-1 flex flex-col max-w-3xl mx-auto w-full">
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 && (
              <div className="text-center text-gray-400 py-12">
                <p className="text-4xl mb-4">💬</p>
                <p className="text-lg font-medium">Try sending a message</p>
                <p className="text-sm mt-2">Examples:</p>
                <div className="flex flex-wrap gap-2 justify-center mt-3">
                  {["Hi there!", "I want to book a table for 2 tonight at 8pm", "What are your opening hours?", "How much does teeth cleaning cost?"].map((s) => (
                    <button key={s} onClick={() => sendMessage(s)} className="px-3 py-1.5 text-sm bg-white dark:bg-gray-800 border rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[80%] px-4 py-2.5 rounded-2xl whitespace-pre-wrap text-sm ${
                    msg.role === "user"
                      ? "bg-green-600 text-white rounded-br-sm"
                      : "bg-white dark:bg-gray-800 border rounded-bl-sm"
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="bg-white dark:bg-gray-800 border px-4 py-3 rounded-2xl rounded-bl-sm">
                  <div className="flex gap-1">
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-4 bg-white dark:bg-gray-900 border-t">
            <form
              onSubmit={(e) => { e.preventDefault(); sendMessage(input); }}
              className="flex gap-2"
            >
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type a message..."
                className="flex-1 px-4 py-2.5 border rounded-full text-sm bg-gray-50 dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500"
                disabled={loading}
              />
              <button
                type="submit"
                disabled={loading || !input.trim()}
                className="px-5 py-2.5 bg-green-600 text-white rounded-full text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                Send
              </button>
            </form>
          </div>
        </div>

        {/* Engine Steps Panel */}
        {steps.length > 0 && (
          <div className="w-80 border-l bg-white dark:bg-gray-900 overflow-y-auto p-4 hidden lg:block">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Engine Trace</h3>
            <div className="space-y-2">
              {steps.map((step) => (
                <div key={step.id} className="text-xs border rounded-lg p-2.5">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${step.status === "completed" ? "bg-green-500" : "bg-yellow-500"}`} />
                    <span className="font-medium">{step.label}</span>
                  </div>
                  {step.detail && <p className="text-gray-500 mt-1 ml-4">{step.detail}</p>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
