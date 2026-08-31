import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database...");

  // ── Admin user ──
  const passwordHash = await bcrypt.hash("freebuff123", 10);
  const admin = await prisma.user.upsert({
    where: { email: "admin@freebuff.app" },
    update: {},
    create: {
      email: "admin@freebuff.app",
      name: "Admin",
      passwordHash,
      role: "OWNER",
      emailVerified: new Date(),
    },
  });
  console.log(`  ✓ Admin user: admin@freebuff.app / freebuff123 (id: ${admin.id})`);

  // ── Demo Restaurant ──
  const restaurant = await prisma.business.upsert({
    where: { slug: "demo-restaurant" },
    update: {},
    create: {
      name: "Demo Restaurant",
      slug: "demo-restaurant",
      businessType: "restaurant",
      description: "A fine dining restaurant with online reservations",
      phone: "+1-555-0101",
      email: "info@demo-restaurant.com",
      workingHours: {
        monday: { open: "11:00", close: "22:00" },
        tuesday: { open: "11:00", close: "22:00" },
        wednesday: { open: "11:00", close: "22:00" },
        thursday: { open: "11:00", close: "22:00" },
        friday: { open: "11:00", close: "23:00" },
        saturday: { open: "10:00", close: "23:00" },
        sunday: { open: "10:00", close: "21:00" },
      },
      status: "active",
    },
  });

  // Idempotent member creation
  await prisma.businessMember.upsert({
    where: { businessId_userId: { businessId: restaurant.id, userId: admin.id } },
    update: {},
    create: { businessId: restaurant.id, userId: admin.id, role: "OWNER" },
  });

  // Idempotent settings creation
  const restaurantSettings = await prisma.businessSettings.findUnique({ where: { businessId: restaurant.id } });
  if (!restaurantSettings) {
    await prisma.businessSettings.create({
      data: {
        businessId: restaurant.id,
        modules: {
          faq: true,
          leadCapture: true,
          leadQualification: true,
          appointmentBooking: true,
          productEnquiry: true,
          orderEnquiry: false,
          paymentLink: false,
          humanHandoff: true,
          followUp: false,
          customerFeedback: false,
        },
        aiConfig: { threshold: 0.6, greetingMessage: "Hello! 👋 Welcome to {{businessName}}. How can I help you today?" },
        bookingConfig: { slotDurationMinutes: 60, maxPerSlot: 4, advanceDays: 30 },
        greetingMessage: "Hello! 👋 Welcome to {{businessName}}. How can I help you today?",
      },
    });
  }

  // Idempotent knowledge base
  const restaurantKnowledge = [
    { type: "opening_hours", title: "Opening Hours", content: "Monday-Thursday: 11am-10pm, Friday: 11am-11pm, Saturday: 10am-11pm, Sunday: 10am-9pm" },
    { type: "faq", title: "Reservations", content: "We accept reservations for parties of 2 or more. Walk-ins are welcome but reservations are recommended for weekends." },
    { type: "pricing", title: "Menu Prices", content: "Starters: $8-15, Main Courses: $18-35, Desserts: $8-12, Drinks: $5-15. Prices may vary." },
    { type: "service", title: "Private Dining", content: "We offer private dining rooms for special occasions. Contact us for pricing and availability." },
    { type: "menu_item", title: "Signature Dishes", content: "Our signature dishes include: Grilled Salmon with Lemon Butter ($28), Beef Tenderloin ($35), Truffle Mushroom Risotto ($24)." },
    { type: "business_info", title: "Location", content: "123 Main Street, Downtown. Free parking available in the building garage." },
    { type: "policy", title: "Cancellation Policy", content: "Please cancel at least 2 hours before your reservation. Late cancellations may incur a fee." },
  ];

  const existingRestaurantKB = await prisma.knowledgeBaseItem.count({ where: { businessId: restaurant.id } });
  if (existingRestaurantKB === 0) {
    for (const item of restaurantKnowledge) {
      await prisma.knowledgeBaseItem.create({
        data: { businessId: restaurant.id, ...item, active: true },
      });
    }
  }

  // Idempotent workflows
  const existingRestaurantWorkflows = await prisma.workflow.count({ where: { businessId: restaurant.id } });
  if (existingRestaurantWorkflows === 0) {
    await prisma.workflow.create({
      data: {
        businessId: restaurant.id,
        name: "Table Booking",
        description: "Collects party size, date, and time, then books a table",
        intents: ["booking"],
        active: true,
        definition: {
          version: 1,
          nodes: [
            { id: "n1", type: "trigger", params: { trigger: "message_received" }, position: { x: 0, y: 0 } },
            { id: "n2", type: "collect_field", params: { field: "service", label: "Occasion", question: "What's the occasion? (e.g. dinner, birthday, anniversary)" }, position: { x: 0, y: 100 } },
            { id: "n3", type: "collect_field", params: { field: "preferredDate", label: "Date", question: "What date would you like to come in?" }, position: { x: 0, y: 200 } },
            { id: "n4", type: "collect_field", params: { field: "preferredTime", label: "Time", question: "What time works for you?" }, position: { x: 0, y: 300 } },
            { id: "n5", type: "create_booking", params: { service: "Table Reservation" }, position: { x: 0, y: 400 } },
            { id: "n6", type: "send_message", params: { text: "Your table is booked! ✅\n\nDate: {{fields.preferredDate}}\nTime: {{fields.preferredTime}}\nOccasion: {{fields.service}}\n\nSee you at {{businessName}}!" }, position: { x: 0, y: 500 } },
            { id: "n7", type: "end", params: {}, position: { x: 0, y: 600 } },
          ],
          edges: [
            { id: "e1", source: "n1", target: "n2" },
            { id: "e2", source: "n2", target: "n3" },
            { id: "e3", source: "n3", target: "n4" },
            { id: "e4", source: "n4", target: "n5" },
            { id: "e5", source: "n5", target: "n6" },
            { id: "e6", source: "n6", target: "n7" },
          ],
        },
      },
    });

    await prisma.workflow.create({
      data: {
        businessId: restaurant.id,
        name: "FAQ & General",
        description: "Answers questions from the knowledge base",
        intents: [],
        active: true,
        definition: {
          version: 1,
          nodes: [
            { id: "f1", type: "trigger", params: { trigger: "message_received" }, position: { x: 0, y: 0 } },
            { id: "f2", type: "knowledge_search", params: { query: "{{message}}" }, position: { x: 0, y: 100 } },
            { id: "f3", type: "generate_ai_response", params: { instructions: "You are a friendly restaurant host. Keep answers short." }, position: { x: 0, y: 200 } },
            { id: "f4", type: "send_message", params: { textFrom: "aiResponse" }, position: { x: 0, y: 300 } },
            { id: "f5", type: "end", params: {}, position: { x: 0, y: 400 } },
          ],
          edges: [
            { id: "fe1", source: "f1", target: "f2" },
            { id: "fe2", source: "f2", target: "f3" },
            { id: "fe3", source: "f3", target: "f4" },
            { id: "fe4", source: "f4", target: "f5" },
          ],
        },
      },
    });
  }

  // ── Demo Dental Clinic ──
  const clinic = await prisma.business.upsert({
    where: { slug: "demo-dental-clinic" },
    update: {},
    create: {
      name: "Demo Dental Clinic",
      slug: "demo-dental-clinic",
      businessType: "clinic",
      description: "Modern dental clinic with online appointment booking",
      phone: "+1-555-0202",
      email: "info@demo-dental.com",
      workingHours: {
        monday: { open: "09:00", close: "18:00" },
        tuesday: { open: "09:00", close: "18:00" },
        wednesday: { open: "09:00", close: "18:00" },
        thursday: { open: "09:00", close: "20:00" },
        friday: { open: "09:00", close: "17:00" },
        saturday: { open: "10:00", close: "14:00" },
        sunday: null,
      },
      status: "active",
    },
  });

  await prisma.businessMember.upsert({
    where: { businessId_userId: { businessId: clinic.id, userId: admin.id } },
    update: {},
    create: { businessId: clinic.id, userId: admin.id, role: "OWNER" },
  });

  const clinicSettings = await prisma.businessSettings.findUnique({ where: { businessId: clinic.id } });
  if (!clinicSettings) {
    await prisma.businessSettings.create({
      data: {
        businessId: clinic.id,
        modules: {
          faq: true,
          leadCapture: true,
          leadQualification: true,
          appointmentBooking: true,
          productEnquiry: false,
          orderEnquiry: false,
          paymentLink: false,
          humanHandoff: true,
          followUp: false,
          customerFeedback: false,
        },
        aiConfig: { threshold: 0.6, greetingMessage: "Hello! 👋 Welcome to {{businessName}}. How can I help you today?" },
        bookingConfig: { slotDurationMinutes: 30, maxPerSlot: 1, advanceDays: 14 },
        greetingMessage: "Hello! 👋 Welcome to {{businessName}}. How can I help you today?",
      },
    });
  }

  const existingClinicKB = await prisma.knowledgeBaseItem.count({ where: { businessId: clinic.id } });
  if (existingClinicKB === 0) {
    const clinicKnowledge = [
      { type: "opening_hours", title: "Opening Hours", content: "Mon-Wed & Fri: 9am-6pm, Thursday: 9am-8pm, Saturday: 10am-2pm. Closed Sundays." },
      { type: "service", title: "Teeth Cleaning", content: "Professional teeth cleaning from $80. Includes exam, X-rays, and polish." },
      { type: "service", title: "Teeth Whitening", content: "In-office teeth whitening from $250. Results last 1-2 years." },
      { type: "service", title: "Dental Implants", content: "Single dental implants from $3,000. Free consultation available." },
      { type: "pricing", title: "Insurance", content: "We accept most major dental insurance plans. Contact us to verify your coverage." },
      { type: "faq", title: "First Visit", content: "Please arrive 15 minutes early for your first visit. Bring your insurance card and photo ID." },
      { type: "policy", title: "Cancellation Policy", content: "Please cancel at least 24 hours before your appointment to avoid a cancellation fee." },
    ];

    for (const item of clinicKnowledge) {
      await prisma.knowledgeBaseItem.create({
        data: { businessId: clinic.id, ...item, active: true },
      });
    }
  }

  const existingClinicWorkflows = await prisma.workflow.count({ where: { businessId: clinic.id } });
  if (existingClinicWorkflows === 0) {
    await prisma.workflow.create({
      data: {
        businessId: clinic.id,
        name: "Appointment Booking",
        description: "Books dental appointments",
        intents: ["booking"],
        active: true,
        definition: {
          version: 1,
          nodes: [
            { id: "cn1", type: "trigger", params: { trigger: "message_received" }, position: { x: 0, y: 0 } },
            { id: "cn2", type: "collect_field", params: { field: "service", label: "Service", question: "What service are you looking for? (e.g. cleaning, whitening, implant consultation)" }, position: { x: 0, y: 100 } },
            { id: "cn3", type: "collect_field", params: { field: "preferredDate", label: "Date", question: "What date works for you?" }, position: { x: 0, y: 200 } },
            { id: "cn4", type: "collect_field", params: { field: "preferredTime", label: "Time", question: "What time would you prefer?" }, position: { x: 0, y: 300 } },
            { id: "cn5", type: "create_booking", params: { service: "Dental Appointment" }, position: { x: 0, y: 400 } },
            { id: "cn6", type: "send_message", params: { text: "Your appointment is booked! ✅\n\nService: {{fields.service}}\nDate: {{fields.preferredDate}}\nTime: {{fields.preferredTime}}\n\nPlease arrive 15 minutes early. See you at {{businessName}}!" }, position: { x: 0, y: 500 } },
            { id: "cn7", type: "end", params: {}, position: { x: 0, y: 600 } },
          ],
          edges: [
            { id: "ce1", source: "cn1", target: "cn2" },
            { id: "ce2", source: "cn2", target: "cn3" },
            { id: "ce3", source: "cn3", target: "cn4" },
            { id: "ce4", source: "cn4", target: "cn5" },
            { id: "ce5", source: "cn5", target: "cn6" },
            { id: "ce6", source: "cn6", target: "cn7" },
          ],
        },
      },
    });

    await prisma.workflow.create({
      data: {
        businessId: clinic.id,
        name: "FAQ & Services",
        description: "Answers questions from the knowledge base",
        intents: [],
        active: true,
        definition: {
          version: 1,
          nodes: [
            { id: "cf1", type: "trigger", params: { trigger: "message_received" }, position: { x: 0, y: 0 } },
            { id: "cf2", type: "knowledge_search", params: { query: "{{message}}" }, position: { x: 0, y: 100 } },
            { id: "cf3", type: "generate_ai_response", params: { instructions: "You are a helpful dental clinic assistant. Keep answers concise and friendly." }, position: { x: 0, y: 200 } },
            { id: "cf4", type: "send_message", params: { textFrom: "aiResponse" }, position: { x: 0, y: 300 } },
            { id: "cf5", type: "end", params: {}, position: { x: 0, y: 400 } },
          ],
          edges: [
            { id: "cfe1", source: "cf1", target: "cf2" },
            { id: "cfe2", source: "cf2", target: "cf3" },
            { id: "cfe3", source: "cf3", target: "cf4" },
            { id: "cfe4", source: "cf4", target: "cf5" },
          ],
        },
      },
    });
  }

  console.log(`  ✓ Restaurant: ${restaurant.id}`);
  console.log(`  ✓ Dental Clinic: ${clinic.id}`);
  console.log("✅ Seed complete!");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
