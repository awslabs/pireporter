/**
 * ToolExecutor - Executes snapshot query tools for the chat mode
 * 
 * Provides methods to query specific parts of the snapshot data including
 * SQL statistics, OS metrics, DB metrics, instance configuration, wait events,
 * and parameter settings. Supports both single snapshot and compare modes.
 * 
 * @module toolExecutor
 */

'use strict';

/**
 * ToolExecutor class executes tools against snapshot data.
 * 
 * @class ToolExecutor
 */
class ToolExecutor {
  /**
   * Creates a new ToolExecutor instance.
   * 
   * @param {Object} snap1 - Primary snapshot data
   * @param {Object} [snap2=null] - Secondary snapshot data (for compare mode)
   * @param {Object} [eventDescriptions={}] - Event descriptions from knowledge base
   */
  constructor(snap1, snap2 = null, eventDescriptions = {}) {
    this.snap1 = snap1;
    this.snap2 = snap2;
    this.eventDescriptions = eventDescriptions;
  }

  /**
   * Executes a tool by name with the given input parameters.
   * Routes to the appropriate tool method based on toolName.
   * 
   * @param {string} toolName - Name of the tool to execute
   * @param {Object} input - Input parameters for the tool
   * @returns {Object} The tool execution result or error object
   */
  execute(toolName, input) {
    switch (toolName) {
      case 'get_sql_stats':
        return this.getSqlStats(input);
      case 'get_os_metrics':
        return this.getOsMetrics(input);
      case 'get_db_metrics':
        return this.getDbMetrics(input);
      case 'get_instance_config':
        return this.getInstanceConfig(input);
      case 'get_wait_events':
        return this.getWaitEvents(input);
      case 'get_parameters':
        return this.getParameters(input);
      case 'get_activity_stats':
        return this.getActivityStats(input);
      case 'save_conversation_report':
        return this.saveConversationReport(input);
      case 'get_event_descriptions':
        return this.getEventDescriptions(input);
      case 'get_workload_analysis':
        return this.getWorkloadAnalysis(input);
      case 'get_current_time':
        return this.getCurrentTime(input);
      default:
        return { error: `Unknown tool: ${toolName}` };
    }
  }

  /**
   * Sets the Bedrock client and lightweight model ID for metric filtering.
   * 
   * @param {Object} bedrockClient - The Bedrock runtime client
   * @param {string} lightweightModelId - The model ID for the lightweight/fast model
   */
  setBedrockClient(bedrockClient, lightweightModelId) {
    this.bedrockClient = bedrockClient;
    this.lightweightModelId = lightweightModelId;
  }

  /**
   * Gets statistics for a specific SQL statement by its ID.
   * Returns dbload, pct_aas, additional metrics, SQL text, load by database,
   * load by user, and wait event breakdown.
   * 
   * @param {Object} input - Input parameters
   * @param {string} [input.sql_id] - The SQL ID to look up
   * @param {string} [input.sql_db_id] - The SQL DB ID (tokenized) to look up
   * @param {string} [input.sort_by='load'] - Sort by metric when listing top SQLs
   * @param {number} [input.limit=10] - Max SQLs to return when listing
   * @param {string} [input.snapshot='primary'] - Which snapshot to query ('primary', 'secondary', 'both')
   * @returns {Object} SQL statistics or error object
   */
  getSqlStats(input) {
    const snapshot = input.snapshot || 'primary';
    const sqlId = input.sql_id;
    const sqlDbId = input.sql_db_id;
    const sortBy = input.sort_by || 'load';
    const limit = input.limit || 10;

    // If no sql_id or sql_db_id provided, list top SQLs
    if (!sqlId && !sqlDbId) {
      // Handle compare mode - query both snapshots
      if (snapshot === 'both') {
        const primaryResult = this._getTopSqlsFromSnapshot(this.snap1, sortBy, limit);
        const secondaryResult = this.snap2 
          ? this._getTopSqlsFromSnapshot(this.snap2, sortBy, limit)
          : { error: 'Secondary snapshot not available' };
        
        return {
          primary: primaryResult,
          secondary: secondaryResult
        };
      }

      // Single snapshot query
      const targetSnapshot = snapshot === 'secondary' ? this.snap2 : this.snap1;
      
      if (!targetSnapshot) {
        return { error: `${snapshot} snapshot not available` };
      }

      return this._getTopSqlsFromSnapshot(targetSnapshot, sortBy, limit);
    }

    // Handle compare mode - query both snapshots
    if (snapshot === 'both') {
      const primaryResult = this._getSqlStatsFromSnapshot(this.snap1, sqlId, sqlDbId);
      const secondaryResult = this.snap2 
        ? this._getSqlStatsFromSnapshot(this.snap2, sqlId, sqlDbId)
        : { error: 'Secondary snapshot not available' };
      
      return {
        primary: primaryResult,
        secondary: secondaryResult
      };
    }

    // Single snapshot query
    const targetSnapshot = snapshot === 'secondary' ? this.snap2 : this.snap1;
    
    if (!targetSnapshot) {
      return { error: `${snapshot} snapshot not available` };
    }

    return this._getSqlStatsFromSnapshot(targetSnapshot, sqlId, sqlDbId);
  }

  /**
   * Helper method to get top SQL statements from a snapshot.
   * 
   * @param {Object} snapshot - The snapshot data
   * @param {string} sortBy - Sort metric ('load', 'io_read', 'io_write', 'io')
   * @param {number} limit - Maximum number of SQLs to return
   * @returns {Object} Top SQL statements or error object
   * @private
   */
  _getTopSqlsFromSnapshot(snapshot, sortBy, limit) {
    // Check if SQLs data exists
    if (!snapshot.SQLs || !snapshot.SQLs.SQLs) {
      return { error: 'No SQL data available in snapshot' };
    }

    const sqlsData = snapshot.SQLs;
    let sortedSqls = [...sqlsData.SQLs];

    // Sort by the specified metric (matching generateHTML.js logic)
    switch (sortBy) {
      case 'io_read':
        sortedSqls.sort((a, b) => {
          const val1 = b.AdditionalMetrics ? parseFloat(b.AdditionalMetrics["db.sql_tokenized.stats.shared_blks_read_per_sec.avg"]) || 0 : 0;
          const val2 = a.AdditionalMetrics ? parseFloat(a.AdditionalMetrics["db.sql_tokenized.stats.shared_blks_read_per_sec.avg"]) || 0 : 0;
          return val1 - val2;
        });
        break;
      case 'io_write':
        sortedSqls.sort((a, b) => {
          const val1 = b.AdditionalMetrics ? parseFloat(b.AdditionalMetrics["db.sql_tokenized.stats.shared_blks_written_per_sec.avg"]) || 0 : 0;
          const val2 = a.AdditionalMetrics ? parseFloat(a.AdditionalMetrics["db.sql_tokenized.stats.shared_blks_written_per_sec.avg"]) || 0 : 0;
          return val1 - val2;
        });
        break;
      case 'io':
        sortedSqls.sort((a, b) => {
          const readB = b.AdditionalMetrics ? parseFloat(b.AdditionalMetrics["db.sql_tokenized.stats.shared_blks_read_per_sec.avg"]) || 0 : 0;
          const writeB = b.AdditionalMetrics ? parseFloat(b.AdditionalMetrics["db.sql_tokenized.stats.shared_blks_written_per_sec.avg"]) || 0 : 0;
          const readA = a.AdditionalMetrics ? parseFloat(a.AdditionalMetrics["db.sql_tokenized.stats.shared_blks_read_per_sec.avg"]) || 0 : 0;
          const writeA = a.AdditionalMetrics ? parseFloat(a.AdditionalMetrics["db.sql_tokenized.stats.shared_blks_written_per_sec.avg"]) || 0 : 0;
          return (readB + writeB) - (readA + writeA);
        });
        break;
      case 'load':
      default:
        sortedSqls.sort((a, b) => parseFloat(b.dbload || 0) - parseFloat(a.dbload || 0));
        break;
    }

    // Take top N
    const topSqls = sortedSqls.slice(0, limit);

    // Build result with summary info for each SQL
    const result = {
      sort_by: sortBy,
      count: topSqls.length,
      total_sqls: sqlsData.SQLs.length,
      sqls: topSqls.map((sql, index) => {
        const entry = {
          rank: index + 1,
          sql_id: sql.sql_id,
          sql_db_id: sql.sql_db_id,
          sql_statement: sql.sql_statement,
          dbload: sql.dbload,
          pct_aas: sql.pct_aas
        };
        
        // Add AdditionalMetrics if present
        if (sql.AdditionalMetrics) {
          entry.blks_read_per_sec = sql.AdditionalMetrics["db.sql_tokenized.stats.shared_blks_read_per_sec.avg"];
          entry.blks_write_per_sec = sql.AdditionalMetrics["db.sql_tokenized.stats.shared_blks_written_per_sec.avg"];
          entry.calls_per_sec = sql.AdditionalMetrics["db.sql_tokenized.stats.calls_per_sec.avg"];
          entry.rows_per_sec = sql.AdditionalMetrics["db.sql_tokenized.stats.rows_per_sec.avg"];
          entry.avg_latency_ms = sql.AdditionalMetrics["db.sql_tokenized.stats.avg_latency_per_call.avg"];
        }
        
        return entry;
      })
    };

    return result;
  }

  /**
   * Helper method to extract SQL stats from a single snapshot.
   * 
   * @param {Object} snapshot - The snapshot data
   * @param {string} [sqlId] - The SQL ID to look up
   * @param {string} [sqlDbId] - The SQL DB ID to look up
   * @returns {Object} SQL statistics or error object
   * @private
   */
  _getSqlStatsFromSnapshot(snapshot, sqlId, sqlDbId) {
    // Check if SQLs data exists
    if (!snapshot.SQLs || !snapshot.SQLs.SQLs) {
      return { error: 'No SQL data available in snapshot' };
    }

    const sqlsData = snapshot.SQLs;
    
    // Find the SQL entry by sql_id or sql_db_id
    const sqlEntry = sqlsData.SQLs.find(sql => {
      if (sqlId && sql.sql_id === sqlId) return true;
      if (sqlDbId && sql.sql_db_id === sqlDbId) return true;
      return false;
    });

    if (!sqlEntry) {
      return { error: 'not found' };
    }

    // Build the result object
    const result = {
      sql_id: sqlEntry.sql_id,
      sql_db_id: sqlEntry.sql_db_id,
      sql_statement: sqlEntry.sql_statement,
      dbload: sqlEntry.dbload,
      pct_aas: sqlEntry.pct_aas
    };

    // Include AdditionalMetrics if present
    if (sqlEntry.AdditionalMetrics) {
      result.AdditionalMetrics = sqlEntry.AdditionalMetrics;
    }

    // Find SQL text from SQLTextFull
    const sqlTextEntry = sqlsData.SQLTextFull?.find(entry => 
      entry.sql_id_tokinized === sqlEntry.sql_id
    );
    
    if (sqlTextEntry) {
      result.sql_text_tokenized = sqlTextEntry.sql_text_tokinized;
      // Include full text entries with their details
      if (sqlTextEntry.sql_ids && sqlTextEntry.sql_ids.length > 0) {
        result.sql_full_texts = sqlTextEntry.sql_ids.map(entry => ({
          db_sql_db_id: entry['db.sql.db_id'],
          db_sql_id: entry['db.sql.id'],
          db_load_avg: entry['db.load.avg'],
          sql_full_text: entry.sql_full_text
        }));
      }
    }

    // Find LoadByDatabase for this SQL
    const loadByDbEntry = sqlsData.LoadByDatabase?.find(entry => 
      entry.sql_id === sqlEntry.sql_id
    );
    
    if (loadByDbEntry) {
      result.LoadByDatabase = loadByDbEntry.dbload;
    }

    // Find LoadByUser for this SQL
    const loadByUserEntry = sqlsData.LoadByUser?.find(entry => 
      entry.sql_id === sqlEntry.sql_id
    );
    
    if (loadByUserEntry) {
      result.LoadByUser = loadByUserEntry.dbload;
    }

    // Find Waits for this SQL
    const waitsEntry = sqlsData.Waits?.find(entry => 
      entry.sql_id === sqlEntry.sql_id
    );
    
    if (waitsEntry) {
      result.Waits = waitsEntry.waits;
    }

    return result;
  }

  /**
   * Gets OS-level metrics like CPU, memory, disk I/O.
   * Can query by category, specific metric name, or use a natural language query
   * that will be filtered by a lightweight LLM.
   * 
   * @param {Object} input - Input parameters
   * @param {string} [input.query] - Natural language query to filter metrics
   * @param {string} [input.category] - Metric category (e.g., 'cpuUtilization', 'memory', 'diskIO')
   * @param {string} [input.metric_name] - Specific metric name within the category
   * @param {string} [input.snapshot='primary'] - Which snapshot to query ('primary', 'secondary', 'both')
   * @returns {Object|Promise<Object>} OS metrics or error object
   */
  getOsMetrics(input) {
    const snapshot = input.snapshot || 'primary';
    const category = input.category;
    const metricName = input.metric_name;
    const query = input.query;

    // If query is provided, use lightweight LLM filtering
    if (query && !category && !metricName) {
      return this._filterOsMetricsWithQuery(snapshot, query);
    }

    // Handle compare mode - query both snapshots
    if (snapshot === 'both') {
      const primaryResult = this._getOsMetricsFromSnapshot(this.snap1, category, metricName);
      const secondaryResult = this.snap2 
        ? this._getOsMetricsFromSnapshot(this.snap2, category, metricName)
        : { error: 'Secondary snapshot not available' };
      
      return {
        primary: primaryResult,
        secondary: secondaryResult
      };
    }

    // Single snapshot query
    const targetSnapshot = snapshot === 'secondary' ? this.snap2 : this.snap1;
    
    if (!targetSnapshot) {
      return { error: `${snapshot} snapshot not available` };
    }

    return this._getOsMetricsFromSnapshot(targetSnapshot, category, metricName);
  }

  /**
   * Filters OS metrics using a lightweight LLM based on a natural language query.
   * 
   * @param {string} snapshotType - Which snapshot to query ('primary', 'secondary', 'both')
   * @param {string} query - Natural language query describing what metrics are needed
   * @returns {Promise<Object>} Filtered OS metrics
   * @private
   */
  async _filterOsMetricsWithQuery(snapshotType, query) {
    const targetSnapshot = snapshotType === 'secondary' ? this.snap2 : this.snap1;
    
    if (!targetSnapshot) {
      return { error: `${snapshotType} snapshot not available` };
    }

    // Get all OS metrics
    const allMetrics = this._getAllOsMetrics(targetSnapshot);
    
    if (allMetrics.error) {
      return allMetrics;
    }

    // If no Bedrock client configured, return all metrics with a warning
    if (!this.bedrockClient || !this.lightweightModelId) {
      return {
        warning: 'Lightweight model not configured, returning all metrics',
        query: query,
        ...allMetrics
      };
    }

    // Use lightweight LLM to filter
    const filteredMetrics = await this._filterMetricsWithLLM(query, allMetrics.metrics, 'OS');
    
    return {
      query: query,
      count: filteredMetrics.length,
      metrics: filteredMetrics
    };
  }

  /**
   * Filters metrics using a lightweight LLM based on a natural language query.
   * The LLM selects which metrics are relevant to the user's query.
   * 
   * @param {string} query - Natural language query describing what metrics are needed
   * @param {Array<Object>} metrics - Array of all available metrics
   * @param {string} metricType - Type of metrics ('OS' or 'DB') for context
   * @returns {Promise<Array<Object>>} Filtered array of relevant metrics
   * @private
   */
  async _filterMetricsWithLLM(query, metrics, metricType) {
    const { ConverseCommand } = require("@aws-sdk/client-bedrock-runtime");
    
    // Build a compact list of metric names and descriptions for the LLM
    const metricList = metrics.map((m, idx) => 
      `${idx}: ${m.metric} (${m.category || ''}) - ${m.desc || 'no description'}`
    ).join('\n');
    
    const systemPrompt = `You are a metric selector. Given a user query about ${metricType} metrics, select ONLY the relevant metric indices from the list.
Return ONLY a JSON array of indices, nothing else. Example: [0, 3, 7]
If no metrics are relevant, return an empty array: []
Be selective - only include metrics that directly relate to the query.`;

    const userMessage = `User query: "${query}"

Available ${metricType} metrics:
${metricList}

Return the indices of relevant metrics as a JSON array:`;

    const input = {
      modelId: this.lightweightModelId,
      messages: [{ role: 'user', content: [{ text: userMessage }] }],
      system: [{ text: systemPrompt }],
      inferenceConfig: {
        maxTokens: 500,
        temperature: 0
      }
    };

    try {
      const command = new ConverseCommand(input);
      const response = await this.bedrockClient.send(command);
      
      // Extract the response text
      const responseText = response.output?.message?.content?.[0]?.text || '[]';
      
      // Parse the JSON array of indices
      const selectedIndices = JSON.parse(responseText.trim());
      
      if (!Array.isArray(selectedIndices)) {
        // If parsing fails or not an array, return all metrics
        return metrics;
      }
      
      // Filter metrics by selected indices
      const filteredMetrics = selectedIndices
        .filter(idx => idx >= 0 && idx < metrics.length)
        .map(idx => metrics[idx]);
      
      // If no metrics selected, return a helpful message
      if (filteredMetrics.length === 0) {
        return metrics.slice(0, 10); // Return first 10 as fallback
      }
      
      return filteredMetrics;
    } catch (error) {
      // On error, return all metrics with a warning
      console.warn(`LLM filtering failed: ${error.message}, returning all metrics`);
      return metrics;
    }
  }

  /**
   * Gets all OS metrics from a snapshot as a flat list.
   * 
   * @param {Object} snapshot - The snapshot data
   * @returns {Object} All OS metrics as a flat list
   * @private
   */
  _getAllOsMetrics(snapshot) {
    if (!snapshot.Metrics || !snapshot.Metrics.OSMetrics) {
      return { error: 'No OS metrics data available in snapshot' };
    }

    const osMetrics = snapshot.Metrics.OSMetrics;
    const allMetrics = [];

    for (const [catKey, catData] of Object.entries(osMetrics)) {
      if (catData.metrics && Array.isArray(catData.metrics)) {
        for (const metric of catData.metrics) {
          allMetrics.push({
            category: catKey,
            categoryName: catData.name,
            ...this._formatSingleMetric(metric)
          });
        }
      }
    }

    return {
      count: allMetrics.length,
      metrics: allMetrics
    };
  }

  /**
   * Helper method to extract OS metrics from a single snapshot.
   * 
   * @param {Object} snapshot - The snapshot data
   * @param {string} [category] - The metric category to look up
   * @param {string} [metricName] - The specific metric name to look up
   * @returns {Object} OS metrics or error object
   * @private
   */
  _getOsMetricsFromSnapshot(snapshot, category, metricName) {
    // Check if OSMetrics data exists
    if (!snapshot.Metrics || !snapshot.Metrics.OSMetrics) {
      return { error: 'No OS metrics data available in snapshot' };
    }

    const osMetrics = snapshot.Metrics.OSMetrics;

    // If no category specified, return all categories with their metrics
    if (!category) {
      const result = {
        categories: Object.keys(osMetrics).map(catKey => ({
          key: catKey,
          name: osMetrics[catKey].name,
          metric_count: osMetrics[catKey].metrics ? osMetrics[catKey].metrics.length : 0
        }))
      };
      return result;
    }

    // Look up the specific category
    const categoryData = osMetrics[category];
    if (!categoryData) {
      return { error: `Category '${category}' not found` };
    }

    // If no metric_name specified, return all metrics in the category
    if (!metricName) {
      return {
        category: category,
        name: categoryData.name,
        metrics: this._formatMetrics(categoryData.metrics)
      };
    }

    // Look up the specific metric within the category
    const metricEntry = categoryData.metrics.find(m => m.metric === metricName);
    if (!metricEntry) {
      return { error: `Metric '${metricName}' not found in category '${category}'` };
    }

    return this._formatSingleMetric(metricEntry);
  }

  /**
   * Formats an array of metrics, extracting avg, max, min, sum values.
   * 
   * @param {Array} metrics - Array of metric objects
   * @returns {Array} Formatted metrics with avg, max, min, sum values
   * @private
   */
  _formatMetrics(metrics) {
    if (!metrics || !Array.isArray(metrics)) {
      return [];
    }

    return metrics.map(m => this._formatSingleMetric(m));
  }

  /**
   * Formats a single metric, extracting avg, max, min, sum values.
   * 
   * @param {Object} metric - A metric object
   * @returns {Object} Formatted metric with avg, max, min, sum values
   * @private
   */
  _formatSingleMetric(metric) {
    const result = {
      metric: metric.metric,
      desc: metric.desc,
      unit: metric.unit
    };

    // Include avg, max, min, sum if they exist
    if (metric.avg !== undefined) {
      result.avg = metric.avg;
    }
    if (metric.max !== undefined) {
      result.max = metric.max;
    }
    if (metric.min !== undefined) {
      result.min = metric.min;
    }
    if (metric.sum !== undefined) {
      result.sum = metric.sum;
    }

    return result;
  }

  /**
   * Gets database-level metrics like connections, transactions, buffer usage.
   * Can query by category, specific metric name, or use a natural language query
   * that will be filtered by a lightweight LLM.
   * 
   * @param {Object} input - Input parameters
   * @param {string} [input.query] - Natural language query to filter metrics
   * @param {string} [input.category] - Metric category
   * @param {string} [input.metric_name] - Specific metric name
   * @param {string} [input.snapshot='primary'] - Which snapshot to query ('primary', 'secondary', 'both')
   * @returns {Object|Promise<Object>} DB metrics or error object
   */
  getDbMetrics(input) {
    const snapshot = input.snapshot || 'primary';
    const category = input.category;
    const metricName = input.metric_name;
    const query = input.query;

    // If query is provided, use lightweight LLM filtering
    if (query && !category && !metricName) {
      return this._filterDbMetricsWithQuery(snapshot, query);
    }

    // Handle compare mode - query both snapshots
    if (snapshot === 'both') {
      const primaryResult = this._getDbMetricsFromSnapshot(this.snap1, category, metricName);
      const secondaryResult = this.snap2 
        ? this._getDbMetricsFromSnapshot(this.snap2, category, metricName)
        : { error: 'Secondary snapshot not available' };
      
      return {
        primary: primaryResult,
        secondary: secondaryResult
      };
    }

    // Single snapshot query
    const targetSnapshot = snapshot === 'secondary' ? this.snap2 : this.snap1;
    
    if (!targetSnapshot) {
      return { error: `${snapshot} snapshot not available` };
    }

    return this._getDbMetricsFromSnapshot(targetSnapshot, category, metricName);
  }

  /**
   * Filters DB metrics using a lightweight LLM based on a natural language query.
   * 
   * @param {string} snapshotType - Which snapshot to query ('primary', 'secondary', 'both')
   * @param {string} query - Natural language query describing what metrics are needed
   * @returns {Promise<Object>} Filtered DB metrics
   * @private
   */
  async _filterDbMetricsWithQuery(snapshotType, query) {
    const targetSnapshot = snapshotType === 'secondary' ? this.snap2 : this.snap1;
    
    if (!targetSnapshot) {
      return { error: `${snapshotType} snapshot not available` };
    }

    // Get all DB metrics
    const allMetrics = this._getAllDbMetrics(targetSnapshot);
    
    if (allMetrics.error) {
      return allMetrics;
    }

    // If no Bedrock client configured, return all metrics with a warning
    if (!this.bedrockClient || !this.lightweightModelId) {
      return {
        warning: 'Lightweight model not configured, returning all metrics',
        query: query,
        ...allMetrics
      };
    }

    // Use lightweight LLM to filter
    const filteredMetrics = await this._filterMetricsWithLLM(query, allMetrics.metrics, 'DB');
    
    return {
      query: query,
      count: filteredMetrics.length,
      metrics: filteredMetrics
    };
  }

  /**
   * Gets all DB metrics from a snapshot as a flat list.
   * 
   * @param {Object} snapshot - The snapshot data
   * @returns {Object} All DB metrics as a flat list
   * @private
   */
  _getAllDbMetrics(snapshot) {
    if (!snapshot.Metrics || !snapshot.Metrics.DBMetrics) {
      return { error: 'No DB metrics data available in snapshot' };
    }

    const dbMetrics = snapshot.Metrics.DBMetrics;
    const allMetrics = [];

    for (const [catKey, catData] of Object.entries(dbMetrics)) {
      if (catData.metrics && Array.isArray(catData.metrics)) {
        for (const metric of catData.metrics) {
          allMetrics.push({
            category: catKey,
            categoryName: catData.name,
            ...this._formatSingleMetric(metric)
          });
        }
      }
    }

    return {
      count: allMetrics.length,
      metrics: allMetrics
    };
  }

  /**
   * Helper method to extract DB metrics from a single snapshot.
   * 
   * @param {Object} snapshot - The snapshot data
   * @param {string} [category] - The metric category to look up
   * @param {string} [metricName] - The specific metric name to look up
   * @returns {Object} DB metrics or error object
   * @private
   */
  _getDbMetricsFromSnapshot(snapshot, category, metricName) {
    // Check if DBMetrics data exists
    if (!snapshot.Metrics || !snapshot.Metrics.DBMetrics) {
      return { error: 'No DB metrics data available in snapshot' };
    }

    const dbMetrics = snapshot.Metrics.DBMetrics;

    // If no category specified, return all categories with their metrics
    if (!category) {
      const result = {
        categories: Object.keys(dbMetrics).map(catKey => ({
          key: catKey,
          name: dbMetrics[catKey].name,
          metric_count: dbMetrics[catKey].metrics ? dbMetrics[catKey].metrics.length : 0
        }))
      };
      return result;
    }

    // Look up the specific category
    const categoryData = dbMetrics[category];
    if (!categoryData) {
      return { error: `Category '${category}' not found` };
    }

    // If no metric_name specified, return all metrics in the category
    if (!metricName) {
      return {
        category: category,
        name: categoryData.name,
        metrics: this._formatMetrics(categoryData.metrics)
      };
    }

    // Look up the specific metric within the category
    const metricEntry = categoryData.metrics.find(m => m.metric === metricName);
    if (!metricEntry) {
      return { error: `Metric '${metricName}' not found in category '${category}'` };
    }

    return this._formatSingleMetric(metricEntry);
  }

  /**
   * Gets instance configuration details like instance class, engine version,
   * storage type, and cluster info.
   * 
   * @param {Object} input - Input parameters
   * @param {string[]} [input.fields] - Specific fields to return. If empty, returns all configuration.
   * @param {string} [input.snapshot='primary'] - Which snapshot to query ('primary', 'secondary', 'both')
   * @returns {Object} Instance configuration or error object
   */
  getInstanceConfig(input) {
    const snapshot = input.snapshot || 'primary';
    const fields = input.fields;

    // Handle compare mode - query both snapshots
    if (snapshot === 'both') {
      const primaryResult = this._getInstanceConfigFromSnapshot(this.snap1, fields);
      const secondaryResult = this.snap2 
        ? this._getInstanceConfigFromSnapshot(this.snap2, fields)
        : { error: 'Secondary snapshot not available' };
      
      return {
        primary: primaryResult,
        secondary: secondaryResult
      };
    }

    // Single snapshot query
    const targetSnapshot = snapshot === 'secondary' ? this.snap2 : this.snap1;
    
    if (!targetSnapshot) {
      return { error: `${snapshot} snapshot not available` };
    }

    return this._getInstanceConfigFromSnapshot(targetSnapshot, fields);
  }

  /**
   * Helper method to extract instance configuration from a single snapshot.
   * 
   * @param {Object} snapshot - The snapshot data
   * @param {string[]} [fields] - Specific fields to return. If empty/undefined, returns all configuration.
   * @returns {Object} Instance configuration or error object
   * @private
   */
  _getInstanceConfigFromSnapshot(snapshot, fields) {
    // Check if GeneralInformation data exists
    if (!snapshot.GeneralInformation) {
      return { error: 'No instance configuration data available in snapshot' };
    }

    const generalInfo = snapshot.GeneralInformation;

    // If no fields specified or empty array, return all configuration
    if (!fields || !Array.isArray(fields) || fields.length === 0) {
      return { ...generalInfo };
    }

    // Filter to only requested fields
    const result = {};
    const notFoundFields = [];

    for (const field of fields) {
      if (Object.prototype.hasOwnProperty.call(generalInfo, field)) {
        result[field] = generalInfo[field];
      } else {
        notFoundFields.push(field);
      }
    }

    // If some fields were not found, include a warning
    if (notFoundFields.length > 0) {
      result._fieldsNotFound = notFoundFields;
    }

    // If no fields were found at all, return an error
    if (Object.keys(result).length === 0 || 
        (Object.keys(result).length === 1 && result._fieldsNotFound)) {
      return { error: `Fields not found: ${notFoundFields.join(', ')}` };
    }

    return result;
  }

  /**
   * Sets the event descriptions for wait events.
   * Event descriptions are loaded from knowledge base files (events.json, events_primary.json).
   * 
   * @param {Object} eventDescriptions - Object mapping event names to their descriptions
   */
  setEventDescriptions(eventDescriptions) {
    this.eventDescriptions = eventDescriptions || {};
  }

  /**
   * Gets wait event information including event name, type, time,
   * and percentage of DB time.
   * 
   * @param {Object} input - Input parameters
   * @param {string} [input.event_name] - Specific wait event name to look up
   * @param {string} [input.snapshot='primary'] - Which snapshot to query ('primary', 'secondary', 'both')
   * @returns {Object} Wait events or error object
   */
  getWaitEvents(input) {
    const snapshot = input.snapshot || 'primary';
    const eventName = input.event_name;

    // Handle compare mode - query both snapshots
    if (snapshot === 'both') {
      const primaryResult = this._getWaitEventsFromSnapshot(this.snap1, eventName);
      const secondaryResult = this.snap2 
        ? this._getWaitEventsFromSnapshot(this.snap2, eventName)
        : { error: 'Secondary snapshot not available' };
      
      return {
        primary: primaryResult,
        secondary: secondaryResult
      };
    }

    // Single snapshot query
    const targetSnapshot = snapshot === 'secondary' ? this.snap2 : this.snap1;
    
    if (!targetSnapshot) {
      return { error: `${snapshot} snapshot not available` };
    }

    return this._getWaitEventsFromSnapshot(targetSnapshot, eventName);
  }

  /**
   * Helper method to extract wait events from a single snapshot.
   * 
   * @param {Object} snapshot - The snapshot data
   * @param {string} [eventName] - Specific wait event name to look up
   * @returns {Object} Wait events or error object
   * @private
   */
  _getWaitEventsFromSnapshot(snapshot, eventName) {
    // Check if WaitEvents data exists
    if (!snapshot.WaitEvents || !snapshot.WaitEvents.TopEvents) {
      return { error: 'No wait events data available in snapshot' };
    }

    const waitEventsData = snapshot.WaitEvents;
    const topEvents = waitEventsData.TopEvents;

    // If no event_name specified, return all top events with descriptions
    if (!eventName) {
      return {
        AlignedStartTime: waitEventsData.AlignedStartTime,
        AlignedEndTime: waitEventsData.AlignedEndTime,
        WallClockTimeSec: waitEventsData.WallClockTimeSec,
        AverageActiveSessions: waitEventsData.AverageActiveSessions,
        DBTimeSeconds: waitEventsData.DBTimeSeconds,
        TopEvents: topEvents.map(event => this._formatWaitEvent(event))
      };
    }

    // Look up the specific event by name
    const eventEntry = topEvents.find(e => e.event_name === eventName);
    if (!eventEntry) {
      return { error: `Wait event '${eventName}' not found` };
    }

    return this._formatWaitEvent(eventEntry);
  }

  /**
   * Formats a single wait event, including description from knowledge base if available.
   * 
   * @param {Object} event - A wait event object
   * @returns {Object} Formatted wait event with description if available
   * @private
   */
  _formatWaitEvent(event) {
    const result = {
      event_name: event.event_name,
      event_type: event.event_type,
      metric_time_sec: event.metric_time_sec,
      pct_db_time: event.pct_db_time
    };

    // Include description from knowledge base if available
    if (this.eventDescriptions && this.eventDescriptions[event.event_name]) {
      result.description = this.eventDescriptions[event.event_name];
    }

    return result;
  }

  /**
   * Gets database parameter settings, specifically non-default parameters.
   * 
   * @param {Object} input - Input parameters
   * @param {string} [input.parameter_name] - Specific parameter name to look up
   * @param {string} [input.snapshot='primary'] - Which snapshot to query ('primary', 'secondary', 'both')
   * @returns {Object} Parameter settings or error object
   */
  getParameters(input) {
    const snapshot = input.snapshot || 'primary';
    const parameterName = input.parameter_name;

    // Handle compare mode - query both snapshots
    if (snapshot === 'both') {
      const primaryResult = this._getParametersFromSnapshot(this.snap1, parameterName);
      const secondaryResult = this.snap2 
        ? this._getParametersFromSnapshot(this.snap2, parameterName)
        : { error: 'Secondary snapshot not available' };
      
      return {
        primary: primaryResult,
        secondary: secondaryResult
      };
    }

    // Single snapshot query
    const targetSnapshot = snapshot === 'secondary' ? this.snap2 : this.snap1;
    
    if (!targetSnapshot) {
      return { error: `${snapshot} snapshot not available` };
    }

    return this._getParametersFromSnapshot(targetSnapshot, parameterName);
  }

  /**
   * Helper method to extract parameters from a single snapshot.
   * 
   * @param {Object} snapshot - The snapshot data
   * @param {string} [parameterName] - Specific parameter name to look up
   * @returns {Object} Parameter settings or error object
   * @private
   */
  _getParametersFromSnapshot(snapshot, parameterName) {
    // Check if NonDefParameters data exists
    if (!snapshot.NonDefParameters) {
      return { error: 'No parameter data available in snapshot' };
    }

    const nonDefParams = snapshot.NonDefParameters;

    // If no parameter_name specified, return all non-default parameters
    if (!parameterName) {
      return {
        parameters: nonDefParams.map(param => this._formatParameter(param)),
        count: nonDefParams.length
      };
    }

    // Look up the specific parameter by name
    const paramEntry = nonDefParams.find(p => p.ParameterName === parameterName);
    
    if (!paramEntry) {
      // Parameter not in non-default list - indicate it's using default value
      return { 
        parameter_name: parameterName,
        using_default: true,
        message: `Parameter '${parameterName}' is not in the non-default parameters list. It is using its default value.`
      };
    }

    return this._formatParameter(paramEntry);
  }

  /**
   * Formats a single parameter entry.
   * 
   * @param {Object} param - A parameter object
   * @returns {Object} Formatted parameter with name, value, description, and apply type
   * @private
   */
  _formatParameter(param) {
    return {
      parameter_name: param.ParameterName,
      parameter_value: param.ParameterValue,
      description: param.Description,
      apply_type: param.ApplyType
    };
  }

  /**
   * Gets instance activity statistics including AAS, DB Time, and wall clock time.
   * 
   * @param {Object} input - Input parameters
   * @param {string} [input.snapshot='primary'] - Which snapshot to query ('primary', 'secondary', 'both')
   * @returns {Object} Activity statistics or error object
   */
  getActivityStats(input) {
    const snapshot = input.snapshot || 'primary';

    // Handle compare mode - query both snapshots
    if (snapshot === 'both') {
      const primaryResult = this._getActivityStatsFromSnapshot(this.snap1);
      const secondaryResult = this.snap2 
        ? this._getActivityStatsFromSnapshot(this.snap2)
        : { error: 'Secondary snapshot not available' };
      
      return {
        primary: primaryResult,
        secondary: secondaryResult
      };
    }

    // Single snapshot query
    const targetSnapshot = snapshot === 'secondary' ? this.snap2 : this.snap1;
    
    if (!targetSnapshot) {
      return { error: `${snapshot} snapshot not available` };
    }

    return this._getActivityStatsFromSnapshot(targetSnapshot);
  }

  /**
   * Helper method to extract activity statistics from a single snapshot.
   * 
   * @param {Object} snapshot - The snapshot data
   * @returns {Object} Activity statistics or error object
   * @private
   */
  _getActivityStatsFromSnapshot(snapshot) {
    // Check if WaitEvents data exists (activity stats are in WaitEvents section)
    if (!snapshot.WaitEvents) {
      return { error: 'No activity statistics available in snapshot' };
    }

    const waitEventsData = snapshot.WaitEvents;

    return {
      AlignedStartTime: waitEventsData.AlignedStartTime,
      AlignedEndTime: waitEventsData.AlignedEndTime,
      WallClockTimeSec: waitEventsData.WallClockTimeSec,
      AverageActiveSessions: waitEventsData.AverageActiveSessions,
      DBTimeSeconds: waitEventsData.DBTimeSeconds,
      description: {
        AverageActiveSessions: 'Average number of sessions actively running at any point in time during the snapshot period',
        DBTimeSeconds: 'Total time spent by all sessions in the database during the snapshot period',
        WallClockTimeSec: 'Total elapsed wall clock time for the snapshot period'
      }
    };
  }

  /**
   * Gets additional derived/calculated metrics.
   * 
   * @param {Object} input - Input parameters
   * @param {string} [input.metric_name] - Specific metric name to look up
   * @param {string} [input.snapshot='primary'] - Which snapshot to query ('primary', 'secondary', 'both')
   * @returns {Object} Additional metrics or error object
   */
  getAdditionalMetrics(input) {
    const snapshot = input.snapshot || 'primary';
    const metricName = input.metric_name;

    // Handle compare mode - query both snapshots
    if (snapshot === 'both') {
      const primaryResult = this._getAdditionalMetricsFromSnapshot(this.snap1, metricName);
      const secondaryResult = this.snap2 
        ? this._getAdditionalMetricsFromSnapshot(this.snap2, metricName)
        : { error: 'Secondary snapshot not available' };
      
      return {
        primary: primaryResult,
        secondary: secondaryResult
      };
    }

    // Single snapshot query
    const targetSnapshot = snapshot === 'secondary' ? this.snap2 : this.snap1;
    
    if (!targetSnapshot) {
      return { error: `${snapshot} snapshot not available` };
    }

    return this._getAdditionalMetricsFromSnapshot(targetSnapshot, metricName);
  }

  /**
   * Helper method to extract additional metrics from a single snapshot.
   * 
   * @param {Object} snapshot - The snapshot data
   * @param {string} [metricName] - Specific metric name to look up
   * @returns {Object} Additional metrics or error object
   * @private
   */
  _getAdditionalMetricsFromSnapshot(snapshot, metricName) {
    // Check if AdditionalMetrics data exists
    if (!snapshot.Metrics || !snapshot.Metrics.AdditionalMetrics) {
      return { error: 'No additional metrics available in snapshot' };
    }

    const additionalMetrics = snapshot.Metrics.AdditionalMetrics;

    // If no metric_name specified, return all additional metrics
    if (!metricName) {
      const metrics = [];
      for (const [key, data] of Object.entries(additionalMetrics)) {
        metrics.push({
          name: key,
          value: data.value,
          unit: data.unit,
          label: data.label,
          description: data.desc
        });
      }
      return {
        count: metrics.length,
        metrics: metrics
      };
    }

    // Look up the specific metric by name
    const metricData = additionalMetrics[metricName];
    if (!metricData) {
      return { error: `Additional metric '${metricName}' not found` };
    }

    return {
      name: metricName,
      value: metricData.value,
      unit: metricData.unit,
      label: metricData.label,
      description: metricData.desc
    };
  }

  /**
   * Sets the report context for saving conversation reports.
   * 
   * @param {Object} context - Report context
   * @param {string} context.snapshotName - Name of the snapshot file
   * @param {string} context.reportsDirectory - Path to reports directory
   * @param {Array} context.messages - Conversation messages array
   */
  setReportContext(context) {
    this.reportContext = context;
  }

  /**
   * Saves the conversation as a markdown report file.
   * 
   * @param {Object} input - Input parameters
   * @param {string} [input.title] - Optional title for the report
   * @param {string} input.summary - Summary of the conversation
   * @returns {Object} Result with file path or error
   */
  saveConversationReport(input) {
    const fs = require('fs');
    const path = require('path');
    
    if (!this.reportContext) {
      return { error: 'Report context not configured. Cannot save report.' };
    }
    
    const { snapshotName, reportsDirectory, messages } = this.reportContext;
    
    if (!snapshotName || !reportsDirectory) {
      return { error: 'Snapshot name or reports directory not configured.' };
    }
    
    const summary = input.summary;
    if (!summary) {
      return { error: 'Summary is required to save the report.' };
    }
    
    // Generate filename: snapshot_xxx.json -> aisummary_xxx.md
    const reportFileName = snapshotName
      .replace(/^snapshot_/, 'aisummary_')
      .replace(/\.json$/, '.md');
    
    const reportPath = path.join(reportsDirectory, reportFileName);
    
    // Get instance info
    const instanceName = this.snap1?.GeneralInformation?.DBInstanceIdentifier || 'Unknown';
    const engine = this.snap1?.GeneralInformation?.Engine || 'Unknown';
    const startTime = this.snap1?.$META$?.startTime || '';
    const endTime = this.snap1?.$META$?.endTime || '';
    
    // Build the markdown report
    const title = input.title || `AI Analysis Summary - ${instanceName}`;
    const timestamp = new Date().toISOString();
    
    let reportContent = `# ${title}

**Generated:** ${timestamp}  
**Instance:** ${instanceName}  
**Engine:** ${engine}  
**Period:** ${startTime} to ${endTime}  

---

## Summary

${summary}

---

## Conversation Log

`;

    // Add conversation messages
    if (messages && messages.length > 0) {
      for (const msg of messages) {
        const role = msg.role === 'user' ? '**User:**' : '**Assistant:**';
        
        if (msg.content && Array.isArray(msg.content)) {
          for (const block of msg.content) {
            if (block.text) {
              reportContent += `${role}\n\n${block.text}\n\n---\n\n`;
            } else if (block.toolUse) {
              reportContent += `*[Tool call: ${block.toolUse.name}]*\n\n`;
            } else if (block.toolResult) {
              // Skip tool results in the log for brevity
            }
          }
        }
      }
    }
    
    // Write the file
    try {
      fs.writeFileSync(reportPath, reportContent, 'utf8');
      console.log(`\n\x1b[32mReport saved to: ${reportPath}\x1b[0m`);
      return { 
        success: true, 
        filePath: reportPath,
        fileName: reportFileName,
        message: `Report saved successfully to ${reportPath}`
      };
    } catch (error) {
      return { error: `Failed to save report: ${error.message}` };
    }
  }

  /**
   * Gets descriptions for wait events or metrics from the knowledge base.
   * 
   * @param {Object} input - Input parameters
   * @param {string[]} input.event_names - Array of event names to look up
   * @returns {Object} Event descriptions or suggestions for not found events
   */
  getEventDescriptions(input) {
    const eventNames = input.event_names;
    
    if (!eventNames || !Array.isArray(eventNames) || eventNames.length === 0) {
      return { error: 'event_names array is required' };
    }
    
    const results = {
      found: [],
      not_found: []
    };
    
    for (const eventName of eventNames) {
      const normalizedName = eventName.toLowerCase().trim();
      let description = null;
      let source = null;
      
      // First check events_primary.json (detailed descriptions)
      if (this.eventDescriptions) {
        // eventDescriptions is already loaded and merged in ChatSession.initialize()
        if (this.eventDescriptions[normalizedName]) {
          description = this.eventDescriptions[normalizedName];
          source = 'knowledge_base';
        }
      }
      
      if (description) {
        results.found.push({
          event_name: eventName,
          description: description,
          source: source
        });
      } else {
        results.not_found.push(eventName);
      }
    }
    
    // Build response
    const response = {
      found_count: results.found.length,
      not_found_count: results.not_found.length,
      events: results.found
    };
    
    if (results.not_found.length > 0) {
      response.not_found_events = results.not_found;
      response.suggestion = `The following events were not found in the knowledge base: ${results.not_found.join(', ')}. ` +
        `Consider using MCP tools (like AWS documentation search) to find descriptions for these events, ` +
        `or ask the user if they have additional context about these events.`;
    }
    
    return response;
  }

  /**
   * Gets workload analysis data including resource usage, instance capacity, and recommendations.
   * Available for provisioned Aurora instances.
   * 
   * @param {Object} input - Input parameters
   * @param {string} [input.snapshot='primary'] - Which snapshot to query
   * @returns {Object} Workload analysis data or error object
   */
  getWorkloadAnalysis(input) {
    const snapshot = input.snapshot || 'primary';
    
    // Handle compare mode
    if (snapshot === 'both') {
      const primaryResult = this._getWorkloadAnalysisFromSnapshot(this.snap1);
      const secondaryResult = this.snap2 
        ? this._getWorkloadAnalysisFromSnapshot(this.snap2)
        : { error: 'Secondary snapshot not available' };
      
      return {
        primary: primaryResult,
        secondary: secondaryResult
      };
    }
    
    const targetSnapshot = snapshot === 'secondary' ? this.snap2 : this.snap1;
    
    if (!targetSnapshot) {
      return { error: `${snapshot} snapshot not available` };
    }
    
    return this._getWorkloadAnalysisFromSnapshot(targetSnapshot);
  }

  /**
   * Extracts workload analysis from a single snapshot.
   * @private
   */
  _getWorkloadAnalysisFromSnapshot(snapshot) {
    const workloadAnalysis = snapshot?.Metrics?.WorkloadAnalyses;
    
    if (!workloadAnalysis) {
      return { 
        error: 'Workload analysis not available. This feature is only available for provisioned Aurora instances.',
        note: 'Serverless instances do not have workload analysis as they auto-scale.'
      };
    }
    
    const result = {
      description: 'Workload analysis compares actual resource usage during the snapshot period against instance capacity limits and recommends suitable instance types.',
      resource_reserve_pct: workloadAnalysis.resource_reserve_pct,
      resource_reserve_pct_desc: `Safety margin for recommendations. ${workloadAnalysis.resource_reserve_pct}% headroom is reserved when calculating if an instance fits the workload.`,
      usage_stats_based_on: workloadAnalysis.usage_stats_based_on,
      usage_stats_based_on_desc: `Resource usage statistics are based on '${workloadAnalysis.usage_stats_based_on}' values from the snapshot period.`,
      snapshot_period_stats: {
        description: 'Actual resource usage observed during the snapshot period',
        vcpus_used: workloadAnalysis.snapshot_period_stats?.snapshot_vcpus_used,
        network_throughput_MBps: workloadAnalysis.snapshot_period_stats?.snapshot_nt_used,
        local_storage_used_GB: workloadAnalysis.snapshot_period_stats?.snapshot_fsys_used,
        max_connections: workloadAnalysis.snapshot_period_stats?.snapshot_max_backends,
        estimated_memory_GB: workloadAnalysis.snapshot_period_stats?.snapshot_memory_estimated_gb,
        local_storage_throughput_MBps: workloadAnalysis.snapshot_period_stats?.snapshot_local_storage_max_throughput
      },
      instance_capacity: {
        description: 'Current instance capacity limits',
        vcpus: workloadAnalysis.instance_capacity?.vcpus,
        network_limit_MBps: workloadAnalysis.instance_capacity?.network_limit_MBps,
        local_storage_GB: workloadAnalysis.instance_capacity?.local_storage_GB,
        max_connections: workloadAnalysis.instance_capacity?.max_connections,
        memory_GB: workloadAnalysis.instance_capacity?.memory_GB,
        local_storage_throughput_limit_MBps: workloadAnalysis.instance_capacity?.local_storage_throughput_limit_MBps
      }
    };
    
    // Add recommendations if available
    if (workloadAnalysis.recommended_instances_found && workloadAnalysis.recommended_instances) {
      const headers = workloadAnalysis.recommended_instances_desc || [];
      result.recommended_instances = {
        description: workloadAnalysis.note || 'Instance types to suit current workload',
        columns: headers,
        instances: workloadAnalysis.recommended_instances.map(row => {
          const instance = {};
          headers.forEach((header, idx) => {
            instance[header] = row[idx];
          });
          return instance;
        })
      };
    } else {
      result.recommended_instances = {
        description: 'No alternative instance recommendations available',
        note: 'Current instance may already be optimal for the workload'
      };
    }
    
    return result;
  }

  /**
   * Gets the current system date and time.
   * 
   * @returns {Object} Current date/time information
   */
  getCurrentTime() {
    const now = new Date();
    return {
      iso: now.toISOString(),
      utc: now.toUTCString(),
      local: now.toString(),
      timestamp: now.getTime(),
      date: now.toISOString().split('T')[0],
      time: now.toISOString().split('T')[1].split('.')[0],
      timezone_offset_minutes: now.getTimezoneOffset()
    };
  }
}

module.exports = { ToolExecutor };
