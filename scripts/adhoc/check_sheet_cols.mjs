function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i], n = text[i + 1];
    if (inQuotes) {
      if (c === '"' && n === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (c !== '\r') field += c;
    }
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}
const URL = 'https://docs.google.com/spreadsheets/d/14Fvt4SJEohqmWOslEoMaGnCV0gRrrjKdh5IRzONKz54/export?format=csv&gid=0';
const text = await (await fetch(URL)).text();
const rows = parseCSV(text);
console.log("Header rows (first 3):");
for (let i = 0; i < 3; i++) {
  console.log(`row ${i}:`, rows[i].slice(0, 14).map((v, j) => `[${j}]${v.slice(0, 15)}`).join(' | '));
}
const data = rows.slice(3).filter(r => r.length > 8 && (r[8] || '').trim());
const codes = ['SL00012', 'SL00037', 'SL00045'];
for (const c of codes) {
  const r = data.find(r => (r[1] || '').trim() === c);
  if (!r) continue;
  console.log(`\n=== ${c} ===`);
  console.log(`name(r[8]): "${r[8]}"`);
  console.log(`address(r[7]): "${r[7]}"`);
  console.log(`project(r[10]): "${r[10]}"`);
  console.log(`project_note(r[11]): "${r[11]}"`);
}
