"use client";

import { useState } from "react";

interface SetupGuide {
  webhookUrl: string;
  hasWebhookSecret: boolean;
  steps: Array<{
    step: number;
    title: string;
    description: string;
    command?: string;
    sql?: string;
    openwaConfig?: Record<string, unknown>;
    curlCommand?: string;
    expectedResponse?: Record<string, unknown>;
    note?: string;
  }>;
  payloadExamples: Record<string, { description: string; payload: unknown }>;
  troubleshooting: Array<{ problem: string; solution: string }>;
  integrations: Array<{ id: string; businessId: string; sessionId: string; enabled: boolean }>;
  businesses: Array<{ id: string; name: string; slug: string }>;
}

export default function WebhooksPage() {
  const [guide, setGuide] = useState<SetupGuide | null>(null);
  const [loading, setLoading] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testLoading, setTestLoading] = useState(false);
  const [testPhone, setTestPhone] = useState("628123456789");
  const [testMessage, setTestMessage] = useState("Hello! I want to book an appointment");
  const [testSession, setTestSession] = useState("default");
  const [expandedStep, setExpandedStep] = useState<number | null>(null);

  const loadGuide = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/webhooks/setup-guide");
      const data = await res.json();
      if (data.ok) setGuide(data.data);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const runTest = async () => {
    setTestLoading(true);
    setTestResult(null);
    try {
      const payload = {
        event: "message.received",
        sessionId: testSession,
        data: {
          id: `test_${Date.now()}`,
          body: testMessage,
          from: `${testPhone}@c.us`,
          timestamp: Math.floor(Date.now() / 1000),
          type: "chat",
          sender: { pushname: "Webhook Test User" },
        },
      };

      const res = await fetch("/api/webhooks/openwa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      setTestResult(JSON.stringify(data, null, 2));
    } catch (e) {
      setTestResult(JSON.stringify({ error: String(e) }, null, 2));
    }
    setTestLoading(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Webhook Setup</h1>
        <p className="text-gray-600 mb-8">
          Configure OpenWA to send message events to Freebuff.
        </p>

        {/* Load Guide Button */}
        {!guide && (
          <button
            onClick={loadGuide}
            disabled={loading}
            className="bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "Loading..." : "Load Setup Guide"}
          </button>
        )}

        {guide && (
          <>
            {/* Webhook URL Card */}
            <div className="bg-white rounded-xl shadow-sm border p-6 mb-6">
              <h2 className="text-lg font-semibold mb-3">📡 Your Webhook URL</h2>
              <div className="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm flex items-center justify-between">
                <span>POST {guide.webhookUrl}</span>
                <button
                  onClick={() => navigator.clipboard.writeText(`POST ${guide.webhookUrl}`)}
                  className="text-gray-400 hover:text-white text-xs bg-gray-700 px-3 py-1 rounded"
                >
                  Copy
                </button>
              </div>
              <div className="mt-3 flex gap-4 text-sm text-gray-500">
                <span>Content-Type: <code className="bg-gray-100 px-1 rounded">application/json</code></span>
                <span>HMAC: <code className="bg-gray-100 px-1 rounded">{guide.hasWebhookSecret ? "Enabled" : "Disabled"}</code></span>
              </div>
            </div>

            {/* Setup Steps */}
            <div className="bg-white rounded-xl shadow-sm border p-6 mb-6">
              <h2 className="text-lg font-semibold mb-4">Setup Steps</h2>
              <div className="space-y-4">
                {guide.steps.map((step) => (
                  <div key={step.step} className="border rounded-lg p-4">
                    <button
                      onClick={() => setExpandedStep(expandedStep === step.step ? null : step.step)}
                      className="w-full text-left flex items-center gap-3"
                    >
                      <span className="bg-blue-100 text-blue-700 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0">
                        {step.step}
                      </span>
                      <span className="font-medium">{step.title}</span>
                      <span className="ml-auto text-gray-400">{expandedStep === step.step ? "▲" : "▼"}</span>
                    </button>
                    {expandedStep === step.step && (
                      <div className="mt-3 ml-11 space-y-3">
                        <p className="text-gray-600 text-sm">{step.description}</p>
                        {step.command && (
                          <div className="bg-gray-900 text-green-400 p-3 rounded-lg font-mono text-xs overflow-x-auto">
                            {step.command}
                          </div>
                        )}
                        {step.note && (
                          <div className="bg-yellow-50 border border-yellow-200 p-3 rounded-lg text-sm text-yellow-800">
                            💡 {step.note}
                          </div>
                        )}
                        {step.sql && (
                          <div className="bg-gray-900 text-green-400 p-3 rounded-lg font-mono text-xs overflow-x-auto whitespace-pre-wrap">
                            {step.sql}
                          </div>
                        )}
                        {step.openwaConfig && (
                          <div className="bg-gray-900 text-green-400 p-3 rounded-lg font-mono text-xs overflow-x-auto">
                            {JSON.stringify(step.openwaConfig, null, 2)}
                          </div>
                        )}
                        {step.curlCommand && (
                          <div className="bg-gray-900 text-green-400 p-3 rounded-lg font-mono text-xs overflow-x-auto whitespace-pre-wrap">
                            {step.curlCommand}
                          </div>
                        )}
                        {step.expectedResponse && (
                          <div className="bg-green-50 border border-green-200 p-3 rounded-lg text-sm">
                            Expected: <code className="font-mono">{JSON.stringify(step.expectedResponse)}</code>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Live Test */}
            <div className="bg-white rounded-xl shadow-sm border p-6 mb-6">
              <h2 className="text-lg font-semibold mb-4">🧪 Live Webhook Test</h2>
              <p className="text-gray-500 text-sm mb-4">
                Send a test payload directly to the webhook endpoint (no OpenWA needed).
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Session ID</label>
                  <input
                    type="text"
                    value={testSession}
                    onChange={(e) => setTestSession(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                    placeholder="default"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
                  <input
                    type="text"
                    value={testPhone}
                    onChange={(e) => setTestPhone(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                    placeholder="628123456789"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
                  <input
                    type="text"
                    value={testMessage}
                    onChange={(e) => setTestMessage(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                    placeholder="Hello!"
                  />
                </div>
              </div>
              <button
                onClick={runTest}
                disabled={testLoading}
                className="bg-green-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-green-700 disabled:opacity-50"
              >
                {testLoading ? "Sending..." : "Send Test Webhook"}
              </button>
              {testResult && (
                <pre className="mt-4 bg-gray-900 text-green-400 p-4 rounded-lg text-xs overflow-x-auto">
                  {testResult}
                </pre>
              )}
            </div>

            {/* Integration Status */}
            <div className="bg-white rounded-xl shadow-sm border p-6 mb-6">
              <h2 className="text-lg font-semibold mb-4">🔗 Active Integrations</h2>
              {guide.integrations.length === 0 ? (
                <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-lg">
                  <p className="text-yellow-800 text-sm">
                    No OpenWA integrations found. Create one using the SQL in Step 3 above.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {guide.integrations.map((i) => (
                    <div key={i.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                      <span className={`w-3 h-3 rounded-full ${i.enabled ? "bg-green-500" : "bg-red-500"}`} />
                      <span className="text-sm font-mono">{i.sessionId}</span>
                      <span className="text-sm text-gray-500">→</span>
                      <span className="text-sm">
                        {guide.businesses.find((b) => b.id === i.businessId)?.name ?? i.businessId}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Troubleshooting */}
            <div className="bg-white rounded-xl shadow-sm border p-6 mb-6">
              <h2 className="text-lg font-semibold mb-4">🔧 Troubleshooting</h2>
              <div className="space-y-3">
                {guide.troubleshooting.map((t, i) => (
                  <details key={i} className="border rounded-lg">
                    <summary className="p-3 cursor-pointer font-medium text-sm hover:bg-gray-50">
                      {t.problem}
                    </summary>
                    <div className="p-3 pt-0 text-sm text-gray-600">
                      {t.solution}
                    </div>
                  </details>
                ))}
              </div>
            </div>

            {/* Payload Examples */}
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <h2 className="text-lg font-semibold mb-4">📦 Payload Examples</h2>
              <div className="space-y-4">
                {Object.entries(guide.payloadExamples).map(([key, example]) => (
                  <details key={key} className="border rounded-lg">
                    <summary className="p-3 cursor-pointer font-medium text-sm hover:bg-gray-50">
                      {example.description}
                    </summary>
                    <pre className="p-3 bg-gray-900 text-green-400 text-xs overflow-x-auto m-3 mt-0 rounded-lg">
                      {JSON.stringify(example.payload, null, 2)}
                    </pre>
                  </details>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
