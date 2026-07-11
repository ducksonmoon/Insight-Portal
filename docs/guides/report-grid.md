# Report results grid

How to use the data table on report result pages (`/reports/{slug}`).

---

## Toolbar

Above each results grid:

| Control | What it does |
| ------- | ------------ |
| **جستجو در جدول** | Quick search across all visible columns |
| **پاک کردن فیلترها** | Clears column filters and quick search |
| **تنظیم عرض ستون‌ها** | Auto-fits column widths (max ~280px per column) |
| **خروجی CSV** | Downloads **filtered** rows as CSV (what you see in the grid) |
| **نمایش X از Y** | Filtered row count vs total loaded rows |

---

## Grid features

- **Sort** — click column headers
- **Filter** — column menu (filter icon in header)
- **Pagination** — Persian footer: صفحه، از، تا، تعداد در صفحه
- **Resize** — drag column borders
- **Copy** — select text in cells and copy (Ctrl+C)
- **Scroll** — horizontal scroll on wide reports; first column can stay pinned

---

## Excel vs CSV

| Export | Where | Best for |
| ------ | ----- | -------- |
| **خروجی Excel** (top of page) | Server | Full report, all rows (up to limit), formatted sheets |
| **خروجی CSV** (grid toolbar) | Browser | Quick share of filtered subset, ad-hoc analysis |

---

## Mobile

- Toolbar wraps to multiple lines on narrow screens
- Swipe horizontally to see more columns
- Pagination controls remain at the bottom

---

## Tips

1. Use **جستجو در جدول** to find a supplier or product name quickly.
2. After filtering, **CSV** exports only matching rows.
3. For accounting archives, prefer **Excel** from the page header.
4. Pin important columns in Studio (admin) so they stay visible while scrolling.

---

## Related

- [Admin guide](./admin-guide.md) — configure columns and grid display in Studio
- [Report packages](./report-packages.md) — `gridConfig` travels with exported reports
