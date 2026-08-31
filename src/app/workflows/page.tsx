"use client";

import { useState, useEffect } from "react";

interface Workflow {
  id: string;
  name: string;
  description: string | null;
  intents: string[];
  active: boolean;
  source: string;
  _count: { executions: number };
  createdAt: string;
}

export default function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBusiness] = useState("demo-restaurant");

  useEffect(() => {
    fetch(`/api/workflows?businessSlug=${selectedBusiness}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) setWorkflows(data.data ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [selectedBusiness]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="bg-white dark:bg-gray-900 border-b px-6 py-4">
        <div className="flex items-center justify-between max-w-6xl mx-auto">
          <div className="flex items-center gap-3">
            <a href="/" className="text-xl">💚</a>
            <h1 className="text-xl font-semibold">Workflows</h1>
          </div>
          <div className="flex gap-3 text-sm">
            <a href="/demo" className="text-gray-600 hover:text-gray-900">Demo</a>
            <a href="/inbox" className="text-gray-600 hover:text-gray-900">Inbox</a>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-6">
        {loading ? (
          <div className="text-center py-12 text-gray-400">Loading...</div>
        ) : workflows.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <p className="text-4xl mb-4">⚡</p>
            <p className="text-lg">No workflows yet</p>
            <p className="text-sm mt-2">Run <code className="bg-gray-100 px-2 py-0.5 rounded">npm run db:seed</code> to create demo workflows</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {workflows.map((wf) => (
              <div key={wf.id} className="bg-white dark:bg-gray-900 border rounded-xl p-5 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-3">
                  <h3 className="font-semibold text-lg">{wf.name}</h3>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${wf.active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                    {wf.active ? "Active" : "Inactive"}
                  </span>
                </div>
                {wf.description && <p className="text-sm text-gray-500 mb-3">{wf.description}</p>}
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {wf.intents.length > 0 ? (
                    wf.intents.map((intent) => (
                      <span key={intent} className="px-2 py-0.5 bg-blue-50 text-blue-600 text-xs rounded-full">{intent}</span>
                    ))
                  ) : (
                    <span className="px-2 py-0.5 bg-gray-100 text-gray-500 text-xs rounded-full">catch-all</span>
                  )}
                </div>
                <div className="text-xs text-gray-400 flex justify-between">
                  <span>{wf._count.executions} executions</span>
                  <span>{wf.source}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
