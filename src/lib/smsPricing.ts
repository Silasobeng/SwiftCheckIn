// Customer-facing SMS pricing. Values are in Ghana pesewas so we never lose
// credits to floating-point rounding.
export const SMS_CUSTOM_PRICE_PESEWAS = 10;

export const SMS_TOPUP_PACKAGES = [
  { id: 'starter', label: 'Starter', amountGhc: 5, credits: 50 },
  { id: 'basic', label: 'Basic', amountGhc: 16, credits: 200 },
  { id: 'standard', label: 'Standard', amountGhc: 35, credits: 500 },
  { id: 'church-plus', label: 'Church Plus', amountGhc: 60, credits: 1000 },
] as const;

export type SmsTopupPackageId = (typeof SMS_TOPUP_PACKAGES)[number]['id'];

export function smsCreditsForCustomTopup(amountGhc: number): number {
  return Math.floor(Math.round(amountGhc * 100) / SMS_CUSTOM_PRICE_PESEWAS);
}

export function findSmsTopupPackage(id: unknown) {
  return typeof id === 'string'
    ? SMS_TOPUP_PACKAGES.find((item) => item.id === id)
    : undefined;
}
