/**
 * Unit tests for ToolExecutor
 * @module test/toolExecutor.test
 */

'use strict';

const { ToolExecutor } = require('../toolExecutor');

// Sample snapshot data
const createTestSnapshot = () => ({
  SQLs: {
    SQLs: [
      { sql_db_id: 'db-id-123', sql_id: 'SQL-ID-ABC', sql_statement: 'SELECT * FROM users', dbload: '1.50', pct_aas: '75.00', AdditionalMetrics: { 'db.sql_tokenized.stats.avg_latency_per_call.avg': 0.05 } },
      { sql_db_id: 'db-id-456', sql_id: 'SQL-ID-DEF', sql_statement: 'INSERT INTO logs', dbload: '0.50', pct_aas: '25.00' }
    ],
    LoadByDatabase: [{ sql_id: 'SQL-ID-ABC', dbload: [{ db: 'production', pct: 80 }] }],
    LoadByUser: [{ sql_id: 'SQL-ID-ABC', dbload: [{ user: 'app_user', pct: 90 }] }],
    Waits: [{ sql_id: 'SQL-ID-ABC', waits: [{ event: 'IO:DataFileRead', pct: 60.5 }] }],
    SQLTextFull: [{ sql_id_tokinized: 'SQL-ID-ABC', sql_text_tokinized: 'SELECT * FROM users', sql_ids: [{ 'db.sql.db_id': 'pi-123', 'db.sql.id': 'FULL-1', 'db.load.avg': 1.5, sql_full_text: 'SELECT * FROM users WHERE id = 42' }] }]
  },
  Metrics: {
    OSMetrics: { cpuUtilization: { name: 'CPU Utilization', metrics: [{ metric: 'os.cpuUtilization.user', desc: 'User CPU', unit: 'Percent', avg: 25.5, max: 80.0, min: 5.0 }] } },
    DBMetrics: { transactions: { name: 'Transactions', metrics: [{ metric: 'db.Transactions.xact_commit', desc: 'Commits', unit: 'Count/sec', avg: 150.5, max: 500.0, min: 10.0 }] } }
  },
  GeneralInformation: { Engine: 'aurora-postgresql', DBInstanceClass: 'db.r5.large', DBInstanceIdentifier: 'my-instance', EngineVersion: '13.4' },
  WaitEvents: { AlignedStartTime: '2024-01-01T00:00:00Z', AlignedEndTime: '2024-01-01T01:00:00Z', DBTimeSeconds: 4304, TopEvents: [{ event_name: 'IO:DataFileRead', event_type: 'IO', metric_time_sec: 3495, pct_db_time: '81.20' }, { event_name: 'CPU', event_type: 'CPU', metric_time_sec: 500, pct_db_time: '11.62' }] },
  NonDefParameters: [{ ParameterName: 'shared_buffers', ParameterValue: '8GB', Description: 'Memory for shared buffers', ApplyType: 'static' }]
});

const createSecondSnapshot = () => ({
  SQLs: { SQLs: [{ sql_db_id: 'db-id-123', sql_id: 'SQL-ID-ABC', sql_statement: 'SELECT * FROM users', dbload: '2.00', pct_aas: '80.00' }], LoadByDatabase: [], LoadByUser: [], Waits: [], SQLTextFull: [] },
  Metrics: { OSMetrics: { cpuUtilization: { name: 'CPU', metrics: [{ metric: 'os.cpuUtilization.user', avg: 50.0 }] } }, DBMetrics: { transactions: { name: 'Transactions', metrics: [{ metric: 'db.Transactions.xact_commit', avg: 300.0 }] } } },
  GeneralInformation: { Engine: 'aurora-postgresql', DBInstanceClass: 'db.r5.xlarge' },
  WaitEvents: { TopEvents: [{ event_name: 'CPU', pct_db_time: '55.56' }], DBTimeSeconds: 9000 },
  NonDefParameters: [{ ParameterName: 'work_mem', ParameterValue: '256MB' }]
});

describe('ToolExecutor - getSqlStats', () => {
  test('returns SQL data by sql_id or sql_db_id', () => {
    const executor = new ToolExecutor(createTestSnapshot());
    const byId = executor.execute('get_sql_stats', { sql_id: 'SQL-ID-ABC' });
    expect(byId.sql_id).toBe('SQL-ID-ABC');
    expect(byId.dbload).toBe('1.50');
    expect(byId.LoadByDatabase).toBeDefined();
    
    const byDbId = executor.execute('get_sql_stats', { sql_db_id: 'db-id-456' });
    expect(byDbId.sql_id).toBe('SQL-ID-DEF');
  });

  test('returns top SQLs when no identifier provided', () => {
    const executor = new ToolExecutor(createTestSnapshot());
    const result = executor.execute('get_sql_stats', {});
    expect(result.sqls).toBeDefined();
    expect(result.sqls[0].rank).toBe(1);
  });

  test('returns error for not found or missing data', () => {
    const executor = new ToolExecutor(createTestSnapshot());
    expect(executor.execute('get_sql_stats', { sql_id: 'NONEXISTENT' }).error).toBe('not found');
    expect(new ToolExecutor({}).execute('get_sql_stats', { sql_id: 'X' }).error).toContain('No SQL data');
  });

  test('compare mode returns data from both snapshots', () => {
    const executor = new ToolExecutor(createTestSnapshot(), createSecondSnapshot());
    const result = executor.execute('get_sql_stats', { sql_id: 'SQL-ID-ABC', snapshot: 'both' });
    expect(result.primary.dbload).toBe('1.50');
    expect(result.secondary.dbload).toBe('2.00');
  });
});

describe('ToolExecutor - getOsMetrics', () => {
  test('returns OS metrics by category', () => {
    const executor = new ToolExecutor(createTestSnapshot());
    const result = executor.execute('get_os_metrics', { category: 'cpuUtilization' });
    expect(result.category).toBe('cpuUtilization');
    expect(result.metrics).toBeDefined();
  });

  test('lists categories when none specified', () => {
    const executor = new ToolExecutor(createTestSnapshot());
    const result = executor.execute('get_os_metrics', {});
    expect(result.categories).toBeDefined();
  });

  test('returns error for missing data', () => {
    expect(new ToolExecutor({}).execute('get_os_metrics', {}).error).toContain('No OS metrics');
  });
});

describe('ToolExecutor - getDbMetrics', () => {
  test('returns DB metrics by category', () => {
    const executor = new ToolExecutor(createTestSnapshot());
    const result = executor.execute('get_db_metrics', { category: 'transactions' });
    expect(result.category).toBe('transactions');
    expect(result.metrics).toBeDefined();
  });

  test('returns error for missing data', () => {
    expect(new ToolExecutor({}).execute('get_db_metrics', {}).error).toContain('No DB metrics');
  });
});

describe('ToolExecutor - getInstanceConfig', () => {
  test('returns instance configuration', () => {
    const executor = new ToolExecutor(createTestSnapshot());
    const result = executor.execute('get_instance_config', {});
    expect(result.Engine).toBe('aurora-postgresql');
    expect(result.DBInstanceClass).toBe('db.r5.large');
  });

  test('returns specific fields when requested', () => {
    const executor = new ToolExecutor(createTestSnapshot());
    const result = executor.execute('get_instance_config', { fields: ['Engine'] });
    expect(result.Engine).toBe('aurora-postgresql');
  });

  test('compare mode returns both snapshots', () => {
    const executor = new ToolExecutor(createTestSnapshot(), createSecondSnapshot());
    const result = executor.execute('get_instance_config', { snapshot: 'both' });
    expect(result.primary.DBInstanceClass).toBe('db.r5.large');
    expect(result.secondary.DBInstanceClass).toBe('db.r5.xlarge');
  });
});

describe('ToolExecutor - getWaitEvents', () => {
  test('returns all wait events', () => {
    const executor = new ToolExecutor(createTestSnapshot());
    const result = executor.execute('get_wait_events', {});
    expect(result.TopEvents).toBeDefined();
    expect(result.TopEvents.length).toBeGreaterThan(0);
  });

  test('returns specific event by name', () => {
    const executor = new ToolExecutor(createTestSnapshot());
    const result = executor.execute('get_wait_events', { event_name: 'IO:DataFileRead' });
    expect(result.event_name).toBe('IO:DataFileRead');
  });

  test('returns error for not found event', () => {
    const executor = new ToolExecutor(createTestSnapshot());
    expect(executor.execute('get_wait_events', { event_name: 'NonExistent' }).error).toContain('not found');
  });
});

describe('ToolExecutor - getParameters', () => {
  test('returns all non-default parameters', () => {
    const executor = new ToolExecutor(createTestSnapshot());
    const result = executor.execute('get_parameters', {});
    expect(result.parameters).toBeDefined();
    expect(result.count).toBeGreaterThan(0);
  });

  test('returns specific parameter by name', () => {
    const executor = new ToolExecutor(createTestSnapshot());
    const result = executor.execute('get_parameters', { parameter_name: 'shared_buffers' });
    expect(result.parameter_name).toBe('shared_buffers');
    expect(result.parameter_value).toBe('8GB');
  });

  test('compare mode returns both snapshots', () => {
    const executor = new ToolExecutor(createTestSnapshot(), createSecondSnapshot());
    const result = executor.execute('get_parameters', { snapshot: 'both' });
    expect(result.primary.parameters).toBeDefined();
    expect(result.secondary.parameters).toBeDefined();
  });
});
