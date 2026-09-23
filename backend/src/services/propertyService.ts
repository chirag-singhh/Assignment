import { prisma } from "../db/prisma.js";
import type { PortfolioProperty } from "../types.js";
import { z } from "zod";

export const propertyInput = z
  .object({
    propertyType: z.string().trim().min(1),
    location: z.string().trim().min(1),
    currentEstimatedValueInr: z.number().positive(),
    subType: z.string().trim().nullable().optional(),
    areaSqft: z.number().positive().nullable().optional(),
    purchasePriceInr: z.number().nonnegative().nullable().optional(),
    annualRentInr: z.number().nonnegative().nullable().optional(),
    occupancyStatus: z.string().trim().nullable().optional(),
    tenantStatus: z.string().trim().nullable().optional(),
    ownershipPercent: z.number().min(0).max(100).nullable().optional(),
    status: z.string().trim().nullable().optional(),
  })
  .strict();

export const completeAgentPropertyInput = propertyInput.extend({
  subType: z.string().trim().nullable(),
  areaSqft: z.number().positive(),
  purchasePriceInr: z.number().nonnegative().nullable(),
  annualRentInr: z.number().nonnegative().nullable(),
  occupancyStatus: z.string().trim().min(1),
  tenantStatus: z.string().trim().nullable(),
  ownershipPercent: z.number().min(0).max(100),
  status: z.string().trim().min(1),
}).strict();

export const propertyChanges = propertyInput
  .partial()
  .refine(
    (value) => Object.keys(value).length > 0,
    "Provide at least one change.",
  );

function mapProperty(property: any): PortfolioProperty {
  return {
    ...property,
    areaSqft: property.areaSqft === null ? null : Number(property.areaSqft),
    currentEstimatedValueInr: Number(property.currentEstimatedValueInr),
    purchasePriceInr:
      property.purchasePriceInr === null
        ? null
        : Number(property.purchasePriceInr),
    annualRentInr:
      property.annualRentInr === null ? null : Number(property.annualRentInr),
    ownershipPercent:
      property.ownershipPercent === null
        ? null
        : Number(property.ownershipPercent),
  };
}
export async function getUserPortfolio(userId: string) {
  return prisma.user.findUnique({ where: { id: userId } });
}
export async function getUserProperties(
  userId: string,
): Promise<PortfolioProperty[]> {
  return (
    await prisma.property.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
    })
  ).map(mapProperty);
}
export async function getPropertyById(userId: string, id: string) {
  const p = await prisma.property.findFirst({ where: { id, userId } });
  return p ? mapProperty(p) : null;
}
export async function addProperty(userId: string, input: any) {
  return mapProperty(
    await prisma.property.create({
      data: { ...propertyInput.parse(input), userId },
    }),
  );
}
export async function updateProperty(userId: string, id: string, input: any) {
  try {
    return mapProperty(
      await prisma.property.update({
        where: { id, userId },
        data: propertyChanges.parse(input),
      }),
    );
  } catch (error) {
    if ((error as { code?: string }).code === "P2025") return null;
    throw error;
  }
}
export async function findMatchingProperties(userId: string, query: string) {
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word && !["property", "my", "the"].includes(word));
  if (!terms.length) return [];
  return (await getUserProperties(userId)).filter((property) => {
    const haystack =
      `${property.id} ${property.location} ${property.propertyType} ${property.subType ?? ""}`.toLowerCase();
    return terms.every((word) => haystack.includes(word));
  });
}
export async function deleteProperty(userId: string, id: string) {
  const existing = await prisma.property.findFirst({ where: { id, userId } });
  if (!existing) return false;
  await prisma.property.delete({ where: { id } });
  return true;
}
