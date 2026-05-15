import sql from 'mssql';
const pool = await sql.connect({ server: '172.41.1.73', port: 1433, user: 'monchiant', password: 'monchiant', database: 'solardb', options: { encrypt: false, trustServerCertificate: true } });
await pool.request().query(`
  UPDATE leads SET
    survey_db_distance_m = 8,
    survey_mdb_brand = 'Schneider',
    survey_mdb_model = 'Easy9',
    survey_breaker_type = 'plug_on',
    survey_panel_to_inverter_m = 15
  WHERE id = 30 AND (survey_db_distance_m IS NULL OR survey_mdb_brand IS NULL OR survey_mdb_model IS NULL OR survey_breaker_type IS NULL OR survey_panel_to_inverter_m IS NULL)
`);
console.log('filled null survey fields for lead 30');
await pool.close();
