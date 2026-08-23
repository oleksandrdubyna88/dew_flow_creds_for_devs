import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildDbConnectionString, parseDbConnectionString } from '../dbConnString';

test('parses a postgres URI into parts', () => {
  assert.deepEqual(parseDbConnectionString('postgresql://alice:s3cr%40t@db.host:5432/main'), {
    host: 'db.host',
    port: '5432',
    database: 'main',
    user: 'alice',
    password: 's3cr@t',
  });
});

test('parses a mongodb URI without port or credentials', () => {
  assert.deepEqual(parseDbConnectionString('mongodb://cluster.example.com/admin'), {
    host: 'cluster.example.com',
    database: 'admin',
  });
});

test('parses an MSSQL key-value string with Server=host,port', () => {
  assert.deepEqual(
    parseDbConnectionString('Server=sql01,1433;Database=crm;User Id=sa;Password=p;'),
    { host: 'sql01', port: '1433', database: 'crm', user: 'sa', password: 'p' },
  );
});

test('round-trips through build → parse for URI types', () => {
  const parts = { host: 'h', port: '3306', database: 'db', user: 'u u', password: 'p@ss' };
  const built = buildDbConnectionString('mysql', parts);
  assert.equal(built, 'mysql://u%20u:p%40ss@h:3306/db');
  assert.deepEqual(parseDbConnectionString(built), parts);
});

test('round-trips through build → parse for mssql', () => {
  const parts = { host: 'sql01', port: '1433', database: 'crm', user: 'sa', password: 'x' };
  assert.deepEqual(parseDbConnectionString(buildDbConnectionString('mssql', parts)), parts);
});

test('a host pasted with a scheme is cleaned, not misparsed', () => {
  // corrupted string produced by pasting "http://host" into the host field
  assert.deepEqual(
    parseDbConnectionString('mysql://http://db.rds.amazonaws.com:3306/orchestrator'),
    { host: 'db.rds.amazonaws.com', port: '3306', database: 'orchestrator' },
  );
  // building with a scheme-polluted host sanitizes it
  assert.equal(
    buildDbConnectionString('mysql', { host: 'http://db.host/x', database: 'db' }),
    'mysql://db.host/db',
  );
});

test('empty and garbage input parse to no parts', () => {
  assert.deepEqual(parseDbConnectionString(''), {});
  assert.deepEqual(parseDbConnectionString('   '), {});
});
