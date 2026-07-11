import type { ConnectionPool } from "mssql";

import { allProviders } from "@/lib/reports/providers";

export type DataSourceEngine = "mssql" | "postgres" | "api";

export type EnvVarSpec = {
  key: string;
  labelFa: string;
};

export type DataSourceProvider = {
  key: string;
  nameFa: string;
  engine: DataSourceEngine;
  isConfigured: () => boolean;
  getPool: () => Promise<ConnectionPool>;
  testConnection: () => Promise<{ ok: boolean; message: string }>;
  requiredEnvVars: EnvVarSpec[];
};

const providers: Record<string, DataSourceProvider> = {};

for (const provider of allProviders) {
  providers[provider.key] = provider;
}

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

export function listConfiguredProviders(): DataSourceProvider[] {
  return listDataSourceProviders().filter((p) => p.isConfigured());
}
