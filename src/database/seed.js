import prisma from "./index.js";
import bcrypt from "bcryptjs";
import crypto from "crypto";

if (process.env.NODE_ENV === "production") {
  console.error("Refusing to seed in production. Set NODE_ENV to development or test.");
  process.exit(1);
}

const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || "Admin123!";
const ORGANIZER_PASSWORD = process.env.SEED_ORGANIZER_PASSWORD || "organizer-password-123";
const STAFF_PASSWORD = "staff-password-123";
const BCRYPT_ROUNDS = 12;

// Nigerian names for sample data
const firstNames = ["Chinedu", "Ngozi", "Oluwaseun", "Aisha", "Emeka", "Fatima", "Ade", "Binta", "Chika", "Dayo", "Efe", "Funke", "Garba", "Halima", "Idris", "Jumoke", "Kalu", "Lola", "Musa", "Nneka"];
const lastNames = ["Okafor", "Adeyemi", "Ibrahim", "Nwosu", "Bello", "Okonkwo", "Abubakar", "Lawal", "Eze", "Balogun", "Oladipo", "Umar", "Mustapha", "Olu", "Nwachukwu", "Sani", "Igwe", "Ojo", "Yusuf", "Adebayo"];
const titles = ["Software Engineer", "Product Manager", "Designer", "CEO", "Student", "Developer", "Data Scientist", "Marketing Manager"];

const getRandomItem = (arr) => arr[Math.floor(Math.random() * arr.length)];

const seed = async () => {
  const startTime = Date.now();
  console.log("Seeding database...");

  let usersCreated = 0;
  let eventsCreated = 0;
  let registrationsCreated = 0;

  // 1. Create Users
  const adminPassword = await bcrypt.hash(ADMIN_PASSWORD, BCRYPT_ROUNDS);
  const admin = await prisma.user.upsert({
    where: { email: "admin@qpass.dev" },
    update: { passwordHash: adminPassword, role: "ADMIN" },
    create: {
      name: "QPass Admin",
      email: "admin@qpass.dev",
      passwordHash: adminPassword,
      role: "ADMIN",
      status: "ACTIVE",
    },
  });
  usersCreated++;

  const organizerPassword = await bcrypt.hash(ORGANIZER_PASSWORD, BCRYPT_ROUNDS);
  const organizer1 = await prisma.user.upsert({
    where: { email: "organizer1@qpass.dev" },
    update: { passwordHash: organizerPassword, role: "ORGANIZER" },
    create: {
      name: "Test Organizer 1",
      email: "organizer1@qpass.dev",
      passwordHash: organizerPassword,
      role: "ORGANIZER",
      status: "ACTIVE",
    },
  });
  usersCreated++;

  const organizer2 = await prisma.user.upsert({
    where: { email: "organizer2@qpass.dev" },
    update: { passwordHash: organizerPassword, role: "ORGANIZER" },
    create: {
      name: "Test Organizer 2",
      email: "organizer2@qpass.dev",
      passwordHash: organizerPassword,
      role: "ORGANIZER",
      status: "ACTIVE",
    },
  });
  usersCreated++;

  const staffPassword = await bcrypt.hash(STAFF_PASSWORD, BCRYPT_ROUNDS);
  const staff1 = await prisma.user.upsert({
    where: { email: "staff1@qpass.dev" },
    update: { passwordHash: staffPassword, role: "STAFF" },
    create: {
      name: "Event Staff 1",
      email: "staff1@qpass.dev",
      passwordHash: staffPassword,
      role: "STAFF",
      status: "ACTIVE",
    },
  });
  usersCreated++;
  
  const staff2 = await prisma.user.upsert({
    where: { email: "staff2@qpass.dev" },
    update: { passwordHash: staffPassword, role: "STAFF" },
    create: {
      name: "Event Staff 2",
      email: "staff2@qpass.dev",
      passwordHash: staffPassword,
      role: "STAFF",
      status: "ACTIVE",
    },
  });
  usersCreated++;

  // 2. Create Events
  const draftEvent = await prisma.event.upsert({
    where: { slug: "draft-conference-abc123" },
    update: { status: "DRAFT" },
    create: {
      title: "Draft Tech Conference",
      description: "A tech conference still in draft mode",
      venue: "Lagos Convention Center",
      slug: "draft-conference-abc123",
      startTime: new Date("2026-09-15T09:00:00Z"),
      endTime: new Date("2026-09-15T17:00:00Z"),
      status: "DRAFT",
      ownerId: organizer1.id,
      registrationMode: "PUBLIC_LINK",
      isPaid: false,
      currency: "NGN",
    },
  });
  eventsCreated++;

  const publishedEvent = await prisma.event.upsert({
    where: { slug: "dev-summit-def456" },
    update: { status: "PUBLISHED" },
    create: {
      title: "Developer Summit 2026",
      description: "Annual developer summit",
      venue: "Abuja National Conference Center",
      slug: "dev-summit-def456",
      startTime: new Date("2026-10-20T08:00:00Z"),
      endTime: new Date("2026-10-20T18:00:00Z"),
      status: "PUBLISHED",
      ownerId: organizer1.id,
      registrationMode: "HYBRID",
      isPaid: true,
      capacity: 500,
      currency: "NGN",
      publishedAt: new Date(),
    },
  });
  eventsCreated++;

  const activeEvent = await prisma.event.upsert({
    where: { slug: "active-startup-meetup-789" },
    update: { status: "ACTIVE" },
    create: {
      title: "Startup Meetup Lagos",
      description: "Networking event for startup founders",
      venue: "Ikeja Tech Hub",
      slug: "active-startup-meetup-789",
      startTime: new Date(Date.now() - 1000 * 60 * 60 * 24), // Started yesterday
      endTime: new Date(Date.now() + 1000 * 60 * 60 * 24), // Ends tomorrow
      status: "ACTIVE",
      ownerId: organizer2.id,
      registrationMode: "PUBLIC_LINK",
      isPaid: false,
      capacity: 200,
      currency: "NGN",
      publishedAt: new Date(),
    },
  });
  eventsCreated++;

  const events = [draftEvent, publishedEvent, activeEvent];

  // 3. Process each event (Ticket Types, Staff, Registrations, CheckIns)
  for (const event of events) {
    // Ticket Types
    const vipTicket = await prisma.ticketType.upsert({
      where: { eventId_sortOrder: { eventId: event.id, sortOrder: 0 } },
      update: {},
      create: {
        eventId: event.id,
        name: "VIP",
        description: "VIP access with premium perks",
        price: event.isPaid ? 50000 : 0,
        capacity: 50,
        sortOrder: 0,
      },
    });
    
    const regularTicket = await prisma.ticketType.upsert({
      where: { eventId_sortOrder: { eventId: event.id, sortOrder: 1 } },
      update: {},
      create: {
        eventId: event.id,
        name: "Regular",
        description: "Standard event access",
        price: event.isPaid ? 15000 : 0,
        capacity: 400,
        sortOrder: 1,
      },
    });

    const studentTicket = await prisma.ticketType.upsert({
      where: { eventId_sortOrder: { eventId: event.id, sortOrder: 2 } },
      update: {},
      create: {
        eventId: event.id,
        name: "Student",
        description: "Discounted student ticket",
        price: event.isPaid ? 5000 : 0,
        capacity: 100,
        sortOrder: 2,
      },
    });
    
    const ticketTypes = [vipTicket, regularTicket, studentTicket];

    // Staff Assignments
    await prisma.eventStaffAssignment.upsert({
      where: { eventId_userId: { eventId: event.id, userId: staff1.id } },
      update: {},
      create: { eventId: event.id, userId: staff1.id, active: true }
    });
    await prisma.eventStaffAssignment.upsert({
      where: { eventId_userId: { eventId: event.id, userId: staff2.id } },
      update: {},
      create: { eventId: event.id, userId: staff2.id, active: true }
    });

    // Registrations
    const regCount = await prisma.registration.count({ where: { eventId: event.id } });
    if (regCount === 0) {
      const numRegistrations = Math.floor(Math.random() * 51) + 50; // 50 to 100
      
      const ticketCodesToInsert = [];
      const registrationsToInsert = [];
      const checkInsToInsert = [];

      for (let i = 0; i < numRegistrations; i++) {
        const ticketType = getRandomItem(ticketTypes);
        const firstName = getRandomItem(firstNames);
        const lastName = getRandomItem(lastNames);
        const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}.${i}@example.com`;
        
        const ticketCodeId = crypto.randomUUID();
        const codeString = `TCK-${event.slug.substring(0,4).toUpperCase()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
        
        const isCheckedIn = Math.random() < 0.4; // ~40% check-in rate

        ticketCodesToInsert.push({
          id: ticketCodeId,
          eventId: event.id,
          code: codeString,
          status: isCheckedIn ? "USED" : "UNUSED",
          attendeeEmail: email,
          attendeeName: `${firstName} ${lastName}`
        });

        const registrationId = crypto.randomUUID();
        registrationsToInsert.push({
          id: registrationId,
          eventId: event.id,
          ticketCodeId: ticketCodeId,
          attendeeEmail: email,
          attendeeName: `${firstName} ${lastName}`,
          ticketTypeId: ticketType.id,
          status: "CONFIRMED",
          source: "PUBLIC_LINK",
          paymentStatus: event.isPaid ? "SUCCESS" : "PENDING",
          metadata: { title: getRandomItem(titles) }
        });

        if (isCheckedIn) {
          checkInsToInsert.push({
            id: crypto.randomUUID(),
            eventId: event.id,
            registrationId: registrationId,
            staffId: getRandomItem([staff1.id, staff2.id]),
            result: "VALID"
          });
        }
      }

      // Batch insert
      await prisma.ticketCode.createMany({ data: ticketCodesToInsert, skipDuplicates: true });
      await prisma.registration.createMany({ data: registrationsToInsert, skipDuplicates: true });
      await prisma.checkIn.createMany({ data: checkInsToInsert, skipDuplicates: true });

      registrationsCreated += registrationsToInsert.length;
    } else {
      registrationsCreated += regCount; // count them if they already exist
    }
  }

  const duration = Date.now() - startTime;

  console.log("\nSeed completed successfully!");
  console.log("──────────────────────────────");
  console.log(`Summary: ${usersCreated} users, ${eventsCreated} events, ${registrationsCreated} registrations processed.`);
  console.log(`Completed in ${duration}ms`);
  console.log("──────────────────────────────");
  console.log("Test credentials:");
  console.log(`  Admin:      admin@qpass.dev / Admin123!`);
  console.log(`  Organizer1: organizer1@qpass.dev / ${ORGANIZER_PASSWORD}`);
  console.log(`  Staff:      staff1@qpass.dev / ${STAFF_PASSWORD}`);
};

seed()
  .catch((error) => {
    console.error("Error seeding database:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
