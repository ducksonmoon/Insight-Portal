# Data source providers

Each ERP or database connector is a `DataSourceProvider` in this folder.

## Add a new connector (4 steps)

1. **Create** `src/lib/reports/providers/your-erp.ts` implementing `DataSourceProvider` from `datasources.ts`.
2. **Register** it in `index.ts` (`allProviders` array).
3. **Seed** a `DataSource` row in Prisma (or setup wizard) with matching `providerKey`.
4. **Document** required env vars in deploy docs and test via **Settings → منابع داده**.

## Example env vars (Rahkaran)

```
RAHKARAN_DB_SERVER=
RAHKARAN_DB_NAME=
RAHKARAN_DB_USER=
RAHKARAN_DB_PASSWORD=
```

Reports reference `dataSourceId` in their definition; Studio only lists **configured** providers.
