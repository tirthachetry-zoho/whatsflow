import Link from "next/link";

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8">
      <div className="max-w-2xl text-center space-y-6">
        <div className="text-6xl mb-4">💚</div>
        <h1 className="text-4xl font-bold tracking-tight">Freebuff Desktop</h1>
        <p className="text-lg text-gray-600 dark:text-gray-400">
          AI-powered WhatsApp Business workflow platform.
          <br />
          Built with <span className="font-semibold text-green-600">OpenWA</span> — free, open-source, self-hosted.
        </p>
        <div className="flex gap-4 justify-center pt-4">
          <Link
            href="/demo"
            className="px-6 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors"
          >
            Try Demo 🚀
          </Link>
          <Link
            href="/api/docs"
            className="px-6 py-3 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg font-medium hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          >
            API Docs
          </Link>
        </div>
        <div className="pt-8 text-sm text-gray-500 space-y-1">
          <p>🤖 <strong>Demo Mode:</strong> Try the engine without WhatsApp or AI credentials</p>
          <p>📊 <strong>Visual Workflows:</strong> Build automation flows with a drag-and-drop editor</p>
          <p>🔌 <strong>OpenWA:</strong> Free self-hosted WhatsApp API — no per-message fees</p>
        </div>
      </div>
    </div>
  );
}
