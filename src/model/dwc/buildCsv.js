/**
 * CSV helpers used by DwC compilation.
 *
 * Expected input shapes
 * - `columns`: Array<string> - ordered list of header names. Each string
 *   represents the CSV column header and the key used to read values from
 *   the row objects. The header strings themselves will be written as the
 *   first (header) row in the output CSV.
 *
 * - `rows`: Array<object> - ordered list of row objects. Each row is a
 *   plain object (or Map-like) mapping column name -> value. For a given
 *   `columns` entry `col`, the cell value is taken as `row[col]`.
 *
 * Rules and behaviours
 * - Missing keys, `null`, or `undefined` are treated as an empty cell.
 * - Non-string values are converted with `String(value)` before escaping.
 * - The order of `columns` defines both the header order and the field
 *   order for every row.
 * - The order of `rows` is preserved in the output CSV.
 * - Fields containing a comma, double quote, CR or LF are enclosed in
 *   double quotes and any internal double quotes are doubled (RFC 4180).
 *
 * Example
 * const columns = ['id','scientificName','decimalLatitude'];
 * const rows = [{id:'u1', scientificName:'Quercus robur', decimalLatitude:51.5}];
 * const csv = buildCsvString(columns, rows);
 */
export function csvField(v) {
  const s = (v === null || v === undefined) ? "" : String(v);
  return (s.includes('"') || s.includes(",") || s.includes("\n") || s.includes("\r"))
    ? '"' + s.replace(/"/g, '""') + '"'
    : s;
}

export function buildCsvString(columns, rows) {
  const lines = [columns.map(csvField).join(",")];
  for (const row of rows) lines.push(columns.map(c => csvField(row[c] ?? "")).join(","));
  return lines.join("\n");
}
