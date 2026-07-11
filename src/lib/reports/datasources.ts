import type { ConnectionPool } from "mssql";

import {
  getRahkaranPool,
  isRahkaranConfigured,
} from "@/lib/db/rahkaran";

export type DataSourceProvider = {
  key: string;
  isConfigured: () => boolean;
  getPool: () => Promise<ConnectionPool>;
};

const providers: Record<string, DataSourceProvider> = {
  rahkaran: {
    key: "rahkaran",
    isConfigured: isRahkaranConfigured,
    getPool: getRahkaranPool,
  },
};

export function registerDataSourceProvider(provider: DataSourceProvider) {
  providers[provider.key] = provider;
}

export function getDataSourceProvider(key: string): DataSourceProvider {
  const provider = providers[key] ?? providers.rahkaran;
  if (!provider) {
    throw new Error(`Unknown data source: ${key}`);
  }
  return provider;
}

export function listDataSourceProviders(): DataSourceProvider[] {
  return Object.values(providers);
}
