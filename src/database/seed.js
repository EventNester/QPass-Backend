import prisma from "./index.js";
import bcrypt from "bcryptjs";
import { hashToken } from "../utils/crypto.js";

if (process.env.NODE_ENV === "production") {
  console.error("Refusing to seed in production. Set NODE_ENV to development or test.");
  process.exit(1);
}

const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || "Admin123!";
const ORGANIZER_PASSWORD = process.env.SEED_ORGANIZER_PASSWORD || "organizer-password-123";
const STAFF_PASSWORD = process.env.SEED_STAFF_PASSWORD || "staff-password-123";
const BCRYPT_ROUNDS = 12;
const QR_EXPIRY_OFFSET_MS = 24 * 60 * 60 * 1000;

// Nigerian names for sample data
const firstNames = ["Chinedu", "Ngozi", "Oluwaseun", "Aisha", "Emeka", "Fatima", "Ade", "Binta", "Chika", "Dayo", "Efe", "Funke", "Garba", "Halima", "Idris", "Jumoke", "Kalu", "Lola", "Musa", "Nneka"];
const lastNames = ["Okafor", "Adeyemi", "Ibrahim", "Nwosu", "Bello", "Okonkwo", "Abubakar", "Lawal", "Eze", "Balogun", "Oladipo", "Umar", "Mustapha", "Olu", "Nwachukwu", "Sani", "Igwe", "Ojo", "Yusuf", "Adebayo"];
const titles = ["Software Engineer", "Product Manager", "Designer", "CEO", "Student", "Developer", "Data Scientist", "Marketing Manager"];

// Deterministic PRNG (mulberry32) so the seeded data is reproducible across
// runs and environments. Change SEED_RANDOM_STATE to get a different dataset.
let randState = Number(process.env.SEED_RANDOM_STATE ?? 42) | 0;
const random = () => {
  randState |= 0;
  randState = (randState + 0x6d2b79f5) | 0;
  let t = Math.imul(randState ^ (randState >>> 15), 1 | randState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const getRandomItem = (arr) => arr[Math.floor(random() * arr.length)];
const getRandomInt = (min, max) => Math.floor(random() * (max - min + 1)) + min;

// Fixed base timestamp so every generated date is deterministic (no Date.now()).
const SEED_TIMESTAMP = Date.parse("2026-08-01T00:00:00.000Z");
const seedTime = new Date(SEED_TIMESTAMP);

// Hex strings derived from the seeded PRNG (replaces crypto.randomUUID/randomBytes).
const randomHex = (length) => {
  let out = "";
  for (let i = 0; i < length; i++) out += "0123456789abcdef"[Math.floor(random() * 16)];
  return out;
};

const seed = async () => {
  const startTime = Date.now();
  console.log("Seeding database...");

  let usersProcessed = 0;
  let eventsProcessed = 0;
  let registrationsProcessed = 0;
  const qrPlaintextSamples = [];

  // 1. Create Users
  const adminPassword = await bcrypt.hash(ADMIN_PASSWORD, BCRYPT_ROUNDS);
  await prisma.user.upsert({
    where: { email: "admin@qpass.dev" },
    update: { passwordHash: adminPassword, role: "ADMIN" },
    create: {
      id: randomHex(32),
      name: "QPass Admin",
      email: "admin@qpass.dev",
      passwordHash: adminPassword,
      role: "ADMIN",
      status: "ACTIVE",
    },
  });
  usersProcessed++;

  const organizerPassword = await bcrypt.hash(ORGANIZER_PASSWORD, BCRYPT_ROUNDS);
  const organizer1 = await prisma.user.upsert({
    where: { email: "organizer@qpass.dev" },
    update: { passwordHash: organizerPassword, role: "ORGANIZER" },
    create: {
      id: randomHex(32),
      name: "Test Organizer 1",
      email: "organizer@qpass.dev",
      passwordHash: organizerPassword,
      role: "ORGANIZER",
      status: "ACTIVE",
    },
  });
  usersProcessed++;

  const organizer2 = await prisma.user.upsert({
    where: { email: "organizer2@qpass.dev" },
    update: { passwordHash: organizerPassword, role: "ORGANIZER" },
    create: {
      id: randomHex(32),
      name: "Test Organizer 2",
      email: "organizer2@qpass.dev",
      passwordHash: organizerPassword,
      role: "ORGANIZER",
      status: "ACTIVE",
    },
  });
  usersProcessed++;

  const staffPassword = await bcrypt.hash(STAFF_PASSWORD, BCRYPT_ROUNDS);
  const staff1 = await prisma.user.upsert({
    where: { email: "staff1@qpass.dev" },
    update: { passwordHash: staffPassword, role: "STAFF" },
    create: {
      id: randomHex(32),
      name: "Event Staff 1",
      email: "staff1@qpass.dev",
      passwordHash: staffPassword,
      role: "STAFF",
      status: "ACTIVE",
    },
  });
  usersProcessed++;

  const staff2 = await prisma.user.upsert({
    where: { email: "staff2@qpass.dev" },
    update: { passwordHash: staffPassword, role: "STAFF" },
    create: {
      id: randomHex(32),
      name: "Event Staff 2",
      email: "staff2@qpass.dev",
      passwordHash: staffPassword,
      role: "STAFF",
      status: "ACTIVE",
    },
  });
  usersProcessed++;

  // 2. Create Events
  const draftEvent = await prisma.event.upsert({
    where: { slug: "draft-conference-abc123" },
    update: { status: "DRAFT", ownerId: organizer1.id },
    create: {
      id: randomHex(32),
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
  eventsProcessed++;

  const publishedEvent = await prisma.event.upsert({
    where: { slug: "dev-summit-def456" },
    update: { status: "PUBLISHED", ownerId: organizer1.id },
    create: {
      id: randomHex(32),
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
      publishedAt: seedTime,
    },
  });
  eventsProcessed++;

  const activeEvent = await prisma.event.upsert({
    where: { slug: "active-startup-meetup-789" },
    update: { status: "ACTIVE", ownerId: organizer2.id },
    create: {
      id: randomHex(32),
      title: "Startup Meetup Lagos",
      description: "Networking event for startup founders",
      venue: "Ikeja Tech Hub",
      slug: "active-startup-meetup-789",
      // Fixed dates keep the ACTIVE event deterministic; the far-future endTime
      // means its QR tokens never expire, so scan/undo testing always works.
      startTime: seedTime,
      endTime: new Date("2027-12-31T18:00:00Z"),
      status: "ACTIVE",
      ownerId: organizer2.id,
      registrationMode: "PUBLIC_LINK",
      isPaid: false,
      capacity: 200,
      currency: "NGN",
      publishedAt: seedTime,
    },
  });
  eventsProcessed++;

  const events = [draftEvent, publishedEvent, activeEvent];

  // 3. Process each event (Ticket Types, Staff, Registrations, CheckIns)
  for (const event of events) {
    // Ticket Types
    const vipTicket = await prisma.ticketType.upsert({
      where: { eventId_sortOrder: { eventId: event.id, sortOrder: 0 } },
      update: {},
      create: {
        id: randomHex(32),
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
        id: randomHex(32),
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
        id: randomHex(32),
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
      create: { id: randomHex(32), eventId: event.id, userId: staff1.id, active: true }
    });
    await prisma.eventStaffAssignment.upsert({
      where: { eventId_userId: { eventId: event.id, userId: staff2.id } },
      update: {},
      create: { id: randomHex(32), eventId: event.id, userId: staff2.id, active: true }
    });

    // Registrations (skip DRAFT events — they are not open for registration)
    if (event.status === "DRAFT") {
      continue;
    }

    const regCount = await prisma.registration.count({ where: { eventId: event.id } });
    if (regCount === 0) {
      const numRegistrations = getRandomInt(50, 100);

      const ticketCodesToInsert = [];
      const registrationsToInsert = [];
      const qrTokensToInsert = [];
      const checkInsToInsert = [];

      for (let i = 0; i < numRegistrations; i++) {
        const ticketType = getRandomItem(ticketTypes);
        const firstName = getRandomItem(firstNames);
        const lastName = getRandomItem(lastNames);
        const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}.${i}@example.com`;

        const ticketCodeId = randomHex(32);
        const codeString = `TCK-${event.slug.substring(0, 4).toUpperCase()}-${randomHex(8).toUpperCase()}`;

        const isCheckedIn = random() < 0.4; // ~40% check-in rate

        ticketCodesToInsert.push({
          id: ticketCodeId,
          eventId: event.id,
          code: codeString,
          status: isCheckedIn ? "USED" : "UNUSED",
          usedAt: isCheckedIn ? seedTime : null,
          createdAt: seedTime,
          attendeeEmail: email,
          attendeeName: `${firstName} ${lastName}`,
        });

        const registrationId = randomHex(32);
        registrationsToInsert.push({
          id: registrationId,
          eventId: event.id,
          ticketCodeId,
          attendeeEmail: email,
          attendeeName: `${firstName} ${lastName}`,
          ticketTypeId: ticketType.id,
          status: "CONFIRMED",
          source: "PUBLIC_LINK",
          paymentStatus: event.isPaid ? "SUCCESS" : "PENDING",
          qrIssued: true,
          qrIssuedAt: seedTime,
          createdAt: seedTime,
          metadata: { title: getRandomItem(titles) },
        });

        // Every registration needs a QrToken so scan/undo work on seeded data.
        // Retain a few plaintext tokens so they can be printed for scanning.
        const qrPlaintext = randomHex(64);
        if (qrPlaintextSamples.length < 3) {
          qrPlaintextSamples.push({ code: codeString, attendeeEmail: email, token: qrPlaintext });
        }
        qrTokensToInsert.push({
          id: randomHex(32),
          registrationId,
          tokenHash: hashToken(qrPlaintext),
          issuedAt: seedTime,
          expiresAt: new Date(event.endTime.getTime() + QR_EXPIRY_OFFSET_MS),
        });

        if (isCheckedIn) {
          checkInsToInsert.push({
            id: randomHex(32),
            eventId: event.id,
            registrationId,
            staffId: getRandomItem([staff1.id, staff2.id]),
            scannedAt: seedTime,
            result: "VALID",
          });
        }
      }

      // Batch insert (order matters for foreign keys)
      await prisma.ticketCode.createMany({ data: ticketCodesToInsert, skipDuplicates: true });
      await prisma.registration.createMany({ data: registrationsToInsert, skipDuplicates: true });
      await prisma.qrToken.createMany({ data: qrTokensToInsert, skipDuplicates: true });
      await prisma.checkIn.createMany({ data: checkInsToInsert, skipDuplicates: true });

      registrationsProcessed += registrationsToInsert.length;
    } else {
      registrationsProcessed += regCount; // count them if they already exist
    }
  }

  const duration = Date.now() - startTime;

  console.log("\nSeed completed successfully!");
  console.log("──────────────────────────────");
  console.log(`Summary: ${usersProcessed} users, ${eventsProcessed} events, ${registrationsProcessed} registrations processed.`);
  console.log(`Completed in ${duration}ms`);
  console.log("──────────────────────────────");
  console.log("Test credentials:");
  console.log(`  Admin:      admin@qpass.dev / ${ADMIN_PASSWORD}`);
  console.log(`  Organizer1: organizer@qpass.dev / ${ORGANIZER_PASSWORD}`);
  console.log(`  Organizer2: organizer2@qpass.dev / ${ORGANIZER_PASSWORD}`);
  console.log(`  Staff1:     staff1@qpass.dev / ${STAFF_PASSWORD}`);
  console.log(`  Staff2:     staff2@qpass.dev / ${STAFF_PASSWORD}`);

  if (qrPlaintextSamples.length > 0) {
    console.log("──────────────────────────────");
    console.log("Sample QR tokens (plaintext) for scan/undo testing:");
    for (const sample of qrPlaintextSamples) {
      console.log(`  ${sample.code}  (${sample.attendeeEmail})`);
      console.log(`    ${sample.token}`);
    }
  }
};

seed()
  .catch((error) => {
    console.error("Error seeding database:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
