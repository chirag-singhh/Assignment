export type PortfolioProperty = {
  id: string;
  userId: string;
  propertyType: string;
  subType: string | null;
  location: string;
  areaSqft: number | null;
  currentEstimatedValueInr: number;
  purchasePriceInr: number | null;
  annualRentInr: number | null;
  occupancyStatus: string | null;
  tenantStatus: string | null;
  ownershipPercent: number | null;
  status: string | null;
};
