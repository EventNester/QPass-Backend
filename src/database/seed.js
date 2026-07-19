const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  // Add your seed data here
  // Example:
  // await prisma.user.create({
  //   data: {
  //     name: "Admin User",
  //     email: "admin@eventnester.com",
  //     passwordHash: "hashed_password_here",
  //     role: "ADMIN",
  //   },
  // });

  console.log("Database seeded successfully");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
