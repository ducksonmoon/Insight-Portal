import { letterOfCreditEntity } from "./definitions/lc";
import { liquidityPositionEntity } from "./definitions/liquidity-position";
import { receivableEntity } from "./definitions/receivable";
import type { BusinessEntityDef } from "./types";

/** All Business Entities. Adding one means appending it here — the sync job and rule engine need no change. */
export const allEntities: BusinessEntityDef[] = [
  receivableEntity as unknown as BusinessEntityDef,
  liquidityPositionEntity as unknown as BusinessEntityDef,
  letterOfCreditEntity as unknown as BusinessEntityDef,
];

export function getEntity(key: string): BusinessEntityDef | undefined {
  return allEntities.find((entity) => entity.key === key);
}

export { receivableEntity } from "./definitions/receivable";
export type { ReceivableRecord } from "./definitions/receivable";
export { liquidityPositionEntity } from "./definitions/liquidity-position";
export type { LiquidityPositionRecord } from "./definitions/liquidity-position";
export { letterOfCreditEntity } from "./definitions/lc";
export type { LetterOfCreditRecord } from "./definitions/lc";
