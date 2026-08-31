export type WorkflowNodeType =
  | "trigger"
  | "classify_intent"
  | "ask_question"
  | "collect_field"
  | "condition"
  | "knowledge_search"
  | "create_lead"
  | "update_lead"
  | "create_booking"
  | "send_message"
  | "generate_ai_response"
  | "send_notification"
  | "human_handoff"
  | "wait"
  | "end"
  | "save_contact";

export interface WorkflowNode {
  id: string;
  type: WorkflowNodeType;
  params: Record<string, unknown>;
  position?: { x: number; y: number };
  label?: string;
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  label?: string;
}

export interface WorkflowDefinition {
  version: 1;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

export interface WorkflowStepLog {
  id: string;
  nodeId?: string;
  type:
    | WorkflowNodeType
    | "intent_classified"
    | "lead_created"
    | "appointment_created"
    | "message_sent";
  label: string;
  detail?: string;
  status: "completed" | "failed" | "blocked";
}

export interface WorkflowState {
  workflowId?: string;
  currentNodeId?: string | null;
  executionId?: string;
  context?: Record<string, unknown>;
  waitingForNodeId?: string | null;
  waitUntil?: string;
  clarifyCount?: number;
}

export interface IntentEntity {
  [key: string]: string | number | boolean | null | undefined;
}

export interface IntentResult {
  intent: string;
  confidence: number;
  entities: IntentEntity;
  reason?: string;
}

export interface OutboundMessage {
  text: string;
  templateId?: string | null;
}
