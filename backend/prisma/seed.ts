import dotenv from "dotenv";
import { existsSync } from "node:fs";
import { parse } from "csv-parse/sync";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { prisma } from "../src/db/prisma.js";

dotenv.config({ path: fileURLToPath(new URL("../../.env", import.meta.url)) });
const dataDir = new URL("../../dataset/", import.meta.url);
const required = ["users.csv", "properties.csv"];
function nullable(value: unknown) {
  const text = String(value ?? "").trim();
  return text ? text : null;
}
function numberOrNull(value: unknown) {
  const text = nullable(value);
  if (text === null) return null;
  const parsed = Number(text.replace(/[,₹]/g, ""));
  if (!Number.isFinite(parsed)) throw new Error(`Invalid number: ${text}`);
  return parsed;
}
async function rows(file: string) {
  return parse(await readFile(new URL(file, dataDir), "utf8"), {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });
}
async function main() {
  const missing = required.filter(
    (file) => !existsSync(new URL(file, dataDir)),
  );
  if (missing.length)
    throw new Error(
      `Missing dataset file(s): ${missing.join(", ")} in dataset/. No data was imported.`,
    );
  for (const row of await rows("users.csv")) {
    const data = {
      name: row.name,
      city: nullable(row.city),
      statedPreferences: nullable(row.preferences),
      preferredLocations: nullable(row.preferred_locations),
      portfolioValuePreference: nullable(row.portfolio_value_preference_inr),
    };
    await prisma.user.upsert({
      where: { id: String(row.user_id) },
      update: data,
      create: { id: String(row.user_id), ...data },
    });
  }
  for (const row of await rows("properties.csv"))
    await prisma.property.upsert({
      where: { id: String(row.property_id) },
      update: {
        userId: String(row.user_id),
        propertyType: row.property_type,
        subType: nullable(row.sub_type),
        location: row.location,
        areaSqft: numberOrNull(row.area_sqft),
        currentEstimatedValueInr:
          numberOrNull(row.current_estimated_value_inr) ?? 0,
        purchasePriceInr: numberOrNull(row.purchase_price_inr),
        annualRentInr: numberOrNull(row.annual_rent_inr),
        occupancyStatus: nullable(row.occupancy_status),
        tenantStatus: nullable(row.tenant_status),
        ownershipPercent: numberOrNull(row.ownership_percent),
        status: nullable(row.status),
      },
      create: {
        id: String(row.property_id),
        userId: String(row.user_id),
        propertyType: row.property_type,
        subType: nullable(row.sub_type),
        location: row.location,
        areaSqft: numberOrNull(row.area_sqft),
        currentEstimatedValueInr:
          numberOrNull(row.current_estimated_value_inr) ?? 0,
        purchasePriceInr: numberOrNull(row.purchase_price_inr),
        annualRentInr: numberOrNull(row.annual_rent_inr),
        occupancyStatus: nullable(row.occupancy_status),
        tenantStatus: nullable(row.tenant_status),
        ownershipPercent: numberOrNull(row.ownership_percent),
        status: nullable(row.status),
      },
    });
  console.log("Dataset import complete.");
}
main().finally(() => prisma.$disconnect());
