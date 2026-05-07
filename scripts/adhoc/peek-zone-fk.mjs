import sql from 'mssql';
const pool = await sql.connect({ server: '172.41.1.73', port: 1433, user: 'monchiant', password: 'monchiant', database: 'solardb', options: { encrypt: false, trustServerCertificate: true } });
const proj = await pool.request().query(`SELECT zone_id, COUNT(*) AS n FROM projects WHERE zone_id IN (3,4,5) GROUP BY zone_id`);
console.log('projects.zone_id:'); console.table(proj.recordset);
const zoneAreas = await pool.request().query(`SELECT zone_id, COUNT(*) AS n FROM zone_areas WHERE zone_id IN (3,4,5) GROUP BY zone_id`);
console.log('zone_areas.zone_id:'); console.table(zoneAreas.recordset);
const calBlocks = await pool.request().query(`SELECT zone, COUNT(*) AS n FROM calendar_blocks WHERE zone LIKE N'กรุงเทพ ทีม%' GROUP BY zone`);
console.log('calendar_blocks.zone:'); console.table(calBlocks.recordset);
await pool.close();
