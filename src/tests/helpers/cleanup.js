import prisma from '../../database/index.js';

export async function cleanDatabase() {
  await prisma.checkIn.deleteMany();
  await prisma.qrToken.deleteMany();
  await prisma.registration.deleteMany();
  await prisma.ticketCode.deleteMany();
  await prisma.ticketType.deleteMany();
  await prisma.importBatch.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.eventStaffAssignment.deleteMany();
  await prisma.event.deleteMany();
  await prisma.user.deleteMany();
}
