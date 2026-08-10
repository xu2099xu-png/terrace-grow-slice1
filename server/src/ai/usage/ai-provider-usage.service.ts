import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma.service';

export interface AiProviderUsageReservation {
  reserved: boolean;
  day: string;
  callCount: number | null;
}

@Injectable()
export class AiProviderUsageService {
  constructor(private readonly prisma: PrismaService) {}

  async reserveProviderCall(
    userId: string,
    provider: string,
    cap: number,
    now = new Date(),
  ): Promise<AiProviderUsageReservation> {
    const day = toShanghaiDay(now);
    if (cap <= 0) return { reserved: false, day, callCount: null };
    const id = randomUUID();

    const rows = await this.prisma.$queryRaw<{ callCount: number }[]>(Prisma.sql`
      INSERT INTO "AiProviderUsageDay" ("id", "userId", "day", "provider", "callCount", "updatedAt")
      VALUES (${id}, ${userId}, ${day}, ${provider}, 1, CURRENT_TIMESTAMP)
      ON CONFLICT ("userId", "day", "provider")
      DO UPDATE SET
        "callCount" = "AiProviderUsageDay"."callCount" + 1,
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE "AiProviderUsageDay"."callCount" < ${cap}
      RETURNING "callCount"
    `);

    const callCount = rows[0]?.callCount ?? null;
    return { reserved: callCount !== null, day, callCount };
  }
}

export function toShanghaiDay(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}
