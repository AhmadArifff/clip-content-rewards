import { prisma } from '../config/prisma.js';

export const userRepository = {
  countUsers() {
    return prisma.user.count();
  },

  findByEmail(email: string) {
    return prisma.user.findUnique({ where: { email } });
  },

  findById(id: string) {
    return prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, name: true, role: true, createdAt: true }
    });
  },

  createUser(data: { email: string; name: string; passwordHash: string; role: string }) {
    return prisma.user.create({
      data,
      select: { id: true, email: true, name: true, role: true, createdAt: true }
    });
  }
};
