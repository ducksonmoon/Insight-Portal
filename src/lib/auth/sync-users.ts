import sql from "mssql";

import { prisma } from "@/lib/db/prisma";
import { getRahkaranPool, isRahkaranConfigured } from "@/lib/db/rahkaran";

type RahkaranUserRow = {
  UserID: number | string;
  Name: string;
  DomainUserName: string | null;
  IsAdministrator: boolean | null;
  Status: number;
  FullName: string | null;
};

export async function syncRahkaranUserByUsername(username: string) {
  if (!isRahkaranConfigured()) return null;

  const pool = await getRahkaranPool();
  const request = pool.request();
  request.input("username", sql.NVarChar, username);

  const result = await request.query<RahkaranUserRow>(`
    SELECT TOP 1
      u.UserID,
      u.Name,
      u.DomainUserName,
      u.IsAdministrator,
      u.Status,
      p.FullName
    FROM SYS3.[User] u
    LEFT JOIN GNR3.Party p ON p.PartyID = u.PartyRef
    WHERE u.Name = @username
  `);

  const row = result.recordset[0];
  if (!row) return null;

  return prisma.user.upsert({
    where: { username: row.Name },
    create: {
      rahkaranUserId: BigInt(row.UserID),
      username: row.Name,
      displayName: row.FullName ?? row.Name,
      domainUserName: row.DomainUserName,
      isAdmin: Boolean(row.IsAdministrator),
      isActive: Number(row.Status) === 1,
    },
    update: {
      rahkaranUserId: BigInt(row.UserID),
      displayName: row.FullName ?? row.Name,
      domainUserName: row.DomainUserName,
      isAdmin: Boolean(row.IsAdministrator),
      isActive: Number(row.Status) === 1,
    },
  });
}

export async function syncAllRahkaranUsers() {
  if (!isRahkaranConfigured()) {
    throw new Error("Rahkaran database is not configured");
  }

  const pool = await getRahkaranPool();
  const result = await pool.request().query<RahkaranUserRow>(`
    SELECT
      u.UserID,
      u.Name,
      u.DomainUserName,
      u.IsAdministrator,
      u.Status,
      p.FullName
    FROM SYS3.[User] u
    LEFT JOIN GNR3.Party p ON p.PartyID = u.PartyRef
    WHERE u.Name IS NOT NULL
  `);

  let upserted = 0;
  for (const row of result.recordset) {
    await prisma.user.upsert({
      where: { username: row.Name },
      create: {
        rahkaranUserId: BigInt(row.UserID),
        username: row.Name,
        displayName: row.FullName ?? row.Name,
        domainUserName: row.DomainUserName,
        isAdmin: Boolean(row.IsAdministrator),
        isActive: Number(row.Status) === 1,
      },
      update: {
        rahkaranUserId: BigInt(row.UserID),
        displayName: row.FullName ?? row.Name,
        domainUserName: row.DomainUserName,
        isAdmin: Boolean(row.IsAdministrator),
        isActive: Number(row.Status) === 1,
      },
    });
    upserted += 1;
  }

  return { upserted };
}
