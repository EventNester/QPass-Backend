import prisma from "./index.js";
import bcrypt from "bcryptjs";

const seed = async () => {
  console.log("Seeding database...");

  // 1. Create admin user
  const adminPassword = await bcrypt.hash("admin-password-123", 12);
  const admin = await prisma.user.upsert({
    where: { email: "admin@qpass.dev" },
    update: {},
    create: {
      name: "QPass Admin",
      email: "admin@qpass.dev",
      passwordHash: adminPassword,
      role: "ADMIN",
      status: "ACTIVE",
    },
  });
  console.log(`Admin user: ${admin.email} (id: ${admin.id})`);

  // 2. Create organizer user
  const organizerPassword = await bcrypt.hash("organizer-password-123", 12);
  const organizer = await prisma.user.upsert({
    where: { email: "organizer@qpass.dev" },
    update: {},
    create: {
      name: "Test Organizer",
      email: "organizer@qpass.dev",
      passwordHash: organizerPassword,
      role: "ORGANIZER",
      status: "ACTIVE",
    },
  });
  console.log(`Organizer user: ${organizer.email} (id: ${organizer.id})`);

  // 3. Create sample events
  const draftEvent = await prisma.event.upsert({
    where: { slug: "draft-conference-abc123" },
    update: {},
    create: {
      title: "Draft Tech Conference",
      description: "A tech conference still in draft mode",
      venue: "Lagos Convention Center",
      slug: "draft-conference-abc123",
      startTime: new Date("2026-09-15T09:00:00Z"),
      endTime: new Date("2026-09-15T17:00:00Z"),
      status: "DRAFT",
      ownerId: organizer.id,
      registrationMode: "PUBLIC_LINK",
      isPaid: false,
      currency: "NGN",
    },
  });
  console.log(`Draft event: ${draftEvent.title} (slug: ${draftEvent.slug})`);

  const publishedEvent = await prisma.event.upsert({
    where: { slug: "dev-summit-def456" },
    update: {},
    create: {
      title: "Developer Summit 2026",
      description: "Annual developer summit",
      venue: "Abuja National Conference Center",
      slug: "dev-summit-def456",
      startTime: new Date("2026-10-20T08:00:00Z"),
      endTime: new Date("2026-10-20T18:00:00Z"),
      status: "PUBLISHED",
      ownerId: organizer.id,
      registrationMode: "HYBRID",
      isPaid: true,
      capacity: 500,
      currency: "NGN",
      publishedAt: new Date(),
    },
  });
  console.log(`Published event: ${publishedEvent.title} (slug: ${publishedEvent.slug})`);

  // 4. Create ticket types for published event
  const vipTicket = await prisma.ticketType.upsert({
    where: { id: "00000000-0000-0000-0000-000000000001" },
    update: {},
    create: {
      eventId: publishedEvent.id,
      name: "VIP",
      description: "VIP access with premium perks",
      price: 50000,
      capacity: 50,
      sortOrder: 0,
    },
  });

  const regularTicket = await prisma.ticketType.upsert({
    where: { id: "00000000-0000-0000-0000-000000000002" },
    update: {},
    create: {
      eventId: publishedEvent.id,
      name: "Regular",
      description: "Standard event access",
      price: 15000,
      capacity: 400,
      sortOrder: 1,
    },
  });

  const studentTicket = await prisma.ticketType.upsert({
    where: { id: "00000000-0000-0000-0000-000000000003" },
    update: {},
    create: {
      eventId: publishedEvent.id,
      name: "Student",
      description: "Discounted student ticket",
      price: 5000,
      capacity: 50,
      sortOrder: 2,
    },
  });
  console.log(`Ticket types created: VIP, Regular, Student`);

  console.log("\nSeed completed successfully!");
  console.log("──────────────────────────────");
  console.log("Test credentials:");
  console.log(`  Admin:      admin@qpass.dev / admin-password-123`);
  console.log(`  Organizer:  organizer@qpass.dev / organizer-password-123`);
};

seed()
  .catch((error) => {
    console.error("Error seeding database:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
