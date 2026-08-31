export const BUSINESS_TYPES = [
  "restaurant", "clinic", "salon", "real_estate", "education",
  "automobile", "ecommerce", "professional_services", "fitness", "other",
] as const;

export const BUSINESS_TYPE_LABELS: Record<string, string> = {
  restaurant: "Restaurant",
  clinic: "Clinic / Healthcare",
  salon: "Salon & Spa",
  real_estate: "Real Estate",
  education: "Education",
  automobile: "Automobile",
  ecommerce: "E-commerce",
  professional_services: "Professional Services",
  fitness: "Fitness & Gym",
  other: "Other",
};

export interface ModuleDef {
  key: string;
  label: string;
  description: string;
}

export const BUSINESS_MODULES: ModuleDef[] = [
  { key: "faq", label: "FAQ", description: "Answer common questions from the business knowledge base" },
  { key: "leadCapture", label: "Lead Capture", description: "Collect contact details of interested customers" },
  { key: "leadQualification", label: "Lead Qualification", description: "Score and qualify leads automatically" },
  { key: "appointmentBooking", label: "Appointment & Booking", description: "Let customers book appointments or reservations" },
  { key: "productEnquiry", label: "Product / Service Enquiry", description: "Answer questions about products and services" },
  { key: "orderEnquiry", label: "Order Enquiry", description: "Answer order status and delivery questions" },
  { key: "paymentLink", label: "Payment Link", description: "Send payment links to customers" },
  { key: "humanHandoff", label: "Human Handoff", description: "Escalate conversations to a human agent" },
  { key: "followUp", label: "Follow-up", description: "Re-engage leads after a configurable delay" },
  { key: "customerFeedback", label: "Customer Feedback", description: "Collect feedback after conversations" },
];

export type ModuleKey = (typeof BUSINESS_MODULES)[number]["key"];

export const DEFAULT_MODULES: Record<ModuleKey, boolean> = {
  faq: true,
  leadCapture: true,
  leadQualification: true,
  appointmentBooking: true,
  productEnquiry: true,
  orderEnquiry: true,
  paymentLink: false,
  humanHandoff: true,
  followUp: false,
  customerFeedback: false,
};

export const CONVERSATION_STATUSES = [
  "NEW", "GREETING", "IDENTIFYING_INTENT", "FAQ", "LEAD_CAPTURE",
  "LEAD_QUALIFICATION", "BOOKING", "ORDER_ENQUIRY", "PAYMENT",
  "HUMAN_HANDOFF", "COMPLETED", "CLOSED",
] as const;

export const INTENTS = [
  "greeting", "faq", "product_enquiry", "service_enquiry", "pricing",
  "lead", "booking", "order_status", "payment", "complaint",
  "human_agent", "unknown",
] as const;

export type Intent = (typeof INTENTS)[number];

export const INTENT_LABELS: Record<string, string> = {
  greeting: "Greeting",
  faq: "FAQ",
  product_enquiry: "Product enquiry",
  service_enquiry: "Service enquiry",
  pricing: "Pricing",
  lead: "Lead / interest",
  booking: "Booking",
  order_status: "Order status",
  payment: "Payment",
  complaint: "Complaint",
  human_agent: "Human agent",
  unknown: "Unknown",
};

export const LEAD_STATUSES = ["NEW", "CONTACTED", "QUALIFIED", "APPOINTMENT", "WON", "LOST"] as const;

export const APPOINTMENT_STATUSES = ["PENDING", "CONFIRMED", "CANCELLED", "COMPLETED"] as const;

export interface NodeTypeDef {
  type: string;
  label: string;
  description: string;
  group: "start" | "process" | "action" | "end";
  accent: "emerald" | "blue" | "amber" | "violet" | "rose" | "zinc";
  defaults: Record<string, unknown>;
}

export const WORKFLOW_NODE_TYPES: NodeTypeDef[] = [
  { type: "trigger", label: "Trigger", description: "Entry point for the workflow", group: "start", accent: "emerald", defaults: { trigger: "message_received" } },
  { type: "classify_intent", label: "AI Intent", description: "Classify the customer's intent", group: "process", accent: "violet", defaults: {} },
  { type: "ask_question", label: "Question", description: "Ask a question and wait for an answer", group: "process", accent: "blue", defaults: { question: "Please provide more details.", field: "" } },
  { type: "collect_field", label: "Collect Field", description: "Collect a lead field from the customer", group: "process", accent: "blue", defaults: { field: "name", label: "Name", question: "What is the customer's name?" } },
  { type: "condition", label: "Condition", description: "Branch based on collected data", group: "process", accent: "amber", defaults: { field: "", operator: "is_not_empty", value: "" } },
  { type: "knowledge_search", label: "Knowledge Search", description: "Search the business knowledge base", group: "process", accent: "amber", defaults: { query: "{{intent}}" } },
  { type: "generate_ai_response", label: "AI Response", description: "Generate a reply with the AI provider", group: "process", accent: "violet", defaults: { instructions: "" } },
  { type: "create_lead", label: "Create Lead", description: "Create a lead from collected data", group: "action", accent: "rose", defaults: {} },
  { type: "update_lead", label: "Update Lead", description: "Update the current lead", group: "action", accent: "rose", defaults: { status: "QUALIFIED", score: 60 } },
  { type: "create_booking", label: "Booking", description: "Create an appointment from collected data", group: "action", accent: "emerald", defaults: {} },
  { type: "send_message", label: "Send Message", description: "Send a text message", group: "action", accent: "blue", defaults: { text: "", templateId: "" } },
  { type: "send_notification", label: "Notification", description: "Notify business staff", group: "action", accent: "amber", defaults: { title: "", content: "" } },
  { type: "human_handoff", label: "Human Handoff", description: "Escalate to a human agent", group: "action", accent: "rose", defaults: { message: "One moment — I'll connect you with a team member." } },
  { type: "wait", label: "Wait", description: "Pause before continuing", group: "process", accent: "zinc", defaults: { durationMinutes: 1440 } },
  { type: "end", label: "End", description: "Finish the workflow", group: "end", accent: "zinc", defaults: {} },
];
