import { reportDefinitions } from '../src/lib/reports/definitions';
import { normalizeDefinition, isCompositeReport, getPrimaryDataset } from '../src/types/report';
import { validateReportDefinition } from '../src/lib/reports/validate';
import { resolveSqlText } from '../src/lib/reports/sql-loader';

let ok = true;
for (const d of reportDefinitions) {
  const n = normalizeDefinition(d);
  if (n.schemaVersion !== 1) { console.error('NOT v1', n.id, n.schemaVersion); ok = false; }
  if (n.datasets.length !== 1 || n.datasets[0].id !== 'main') { console.error('datasets', n.id); ok = false; }
  if (isCompositeReport(n)) { console.error('composite', n.id); ok = false; }
  const sql = resolveSqlText(n);
  const v = validateReportDefinition(n, sql);
  const errs = v.issues.filter((i) => i.level === 'error');
  if (errs.length) { console.error('validate', n.id, errs.map((e) => e.message)); ok = false; }
  console.log('OK', n.id, 'cols', n.columns.length, 'params', n.parameters.length);
}
console.log(ok ? 'ALL_V1_OK' : 'FAIL');
process.exit(ok ? 0 : 1);

