import type { WorkflowStepLog } from "@/types/workflow";

export * from "@/types/workflow";

export interface ApiOk<T = unknown> {
  ok: true;
  data: T;
}

export interface ApiErrorBody {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export type ApiResponse<T = unknown> = ApiOk<T> | ApiErrorBody;

export interface MessageItem {
  id: string;
  conversationId: string;
  role: string;
  content: string;
  mediaUrl: string | null;
  mediaType: string | null;
  intent: string | null;
  status: string;
  error: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date | string;
}

export interface DemoSimulationResult {
  conversationId: string;
  contactId: string;
  messages: MessageItem[];
  steps: WorkflowStepLog[];
  conversationStatus: string;
  intent: string | null;
  aiEnabled: boolean;
  leadId?: string | null;
  appointmentId?: string | null;
}
