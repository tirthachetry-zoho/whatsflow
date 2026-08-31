"use client";

import { useState, useEffect } from "react";

interface Conversation {
  id: string;
  status: string;
  channel: string;
  intent: string | null;
  lastMessageAt: string;
  contact: { name: string | null; phone: string | null };
  messages: Array<{ content: string; role: string; createdAt: string }>;
}

export default function InboxPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ conversation: Conversation; messages: Array<{ role: string; content: string; createdAt: string }> } | null>(null);

  useEffect(() => {
    fetch("/api/conversations?businessId=demo-restaurant")
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) setConversations(data.data?.items ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (selected) {
      fetch(`/api/conversations/${selected}`)
        .then((r) => r.json())
        .then((data) => { if (data.ok) setDetail(data.data); });
    }
  }, [selected]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex">
      {/* Sidebar */}
      <div className="w-80 border-r bg-white dark:bg-gray-900 flex flex-col">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <div className="flex items-center gap-2">
            <a href="/" className="text-xl">💚</a>
            <h2 className="font-semibold">Inbox</h2>
          </div>
          <div className="flex gap-2 text-sm">
            <a href="/workflows" className="text-gray-500 hover:text-gray-700">Workflows</a>
            <a href="/demo" className="text-gray-500 hover:text-gray-700">Demo</a>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-4 text-gray-400 text-sm">Loading...</div>
          ) : conversations.length === 0 ? (
            <div className="p-8 text-center text-gray-400">
              <p className="text-3xl mb-2">📭</p>
              <p className="text-sm">No conversations yet</p>
              <p className="text-xs mt-1">Try the <a href="/demo" className="text-green-600 underline">demo</a> to start one</p>
            </div>
          ) : (
            conversations.map((conv) => (
              <button
                key={conv.id}
                onClick={() => setSelected(conv.id)}
                className={`w-full text-left px-4 py-3 border-b hover:bg-gray-50 dark:hover:bg-gray-800 ${selected === conv.id ? "bg-green-50 dark:bg-green-950" : ""}`}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-medium text-sm">{conv.contact.name || conv.contact.phone || "Unknown"}</p>
                    <p className="text-xs text-gray-500 truncate max-w-[200px]">
                      {conv.messages[0]?.content || "No messages"}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700">{conv.status}</span>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Detail Panel */}
      <div className="flex-1 flex flex-col">
        {detail ? (
          <>
            <div className="px-6 py-3 border-b bg-white dark:bg-gray-900">
              <h3 className="font-semibold">{detail.conversation.contact.name || detail.conversation.contact.phone}</h3>
              <p className="text-xs text-gray-500">Status: {detail.conversation.status} · Intent: {detail.conversation.intent || "—"}</p>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-3">
              {detail.messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === "user" ? "justify-start" : "justify-end"}`}>
                  <div className={`max-w-[70%] px-4 py-2.5 rounded-2xl text-sm whitespace-pre-wrap ${
                    msg.role === "user"
                      ? "bg-gray-200 dark:bg-gray-700 rounded-bl-sm"
                      : "bg-green-600 text-white rounded-br-sm"
                  }`}>
                    {msg.content}
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            <div className="text-center">
              <p className="text-4xl mb-2">💬</p>
              <p>Select a conversation to view details</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
