import prisma from "./index.js";

const seed = async () => {
  const user = await prisma.user.upsert({
    where: {
      email: "testuser@example.com",
    },
    update: {},
    create: {
      name: "Test Organizer",
      email: "testuser@example.com",
      passwordHash: "test-password-hash",
      role: "ORGANIZER",
      status: "ACTIVE",
    },
  });

  console.log("Test user created successfully:");
  console.log(user);
};

seed()
  .catch((error) => {
    console.error("Error seeding database:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });