/**
 * Tool Definitions for Interactive Chat Mode
 * 
 * Defines tool schemas compatible with Bedrock's Converse API tool use format.
 * These tools allow the LLM to query specific parts of the snapshot data
 * when answering user questions about database performance.
 * 
 * @module toolDefinitions
 */

'use strict';

/**
 * Tool configuration object containing all snapshot query tools.
 * Follows Bedrock's toolSpec format with name, description, and inputSchema.
 * 
 * Tools:
 * - get_sql_stats: SQL statement statistics
 * - get_os_metrics: OS-level metrics (CPU, memory, disk I/O) with smart filtering
 * - get_db_metrics: Database-level metrics with smart filtering
 * - get_instance_config: Instance configuration details
 * - get_wait_events: Wait event information
 * - get_parameters: Database parameter settings
 * - get_activity_stats: Instance activity statistics (AAS, DBTime, wall clock time)
 * 
 * Note: Additional metrics (derived/calculated) are included directly in the system prompt.
 */
const toolConfig = {
  tools: [
    {
      toolSpec: {
        name: "get_sql_stats",
        description: "Get statistics for SQL statements. Can either look up a specific SQL by ID, or list top SQL statements sorted by load, read I/O, or write I/O. Returns dbload (database load), pct_aas (percentage of average active sessions), I/O metrics, SQL text, and more. Use this tool when the user asks about SQL queries, their performance, or resource consumption.",
        inputSchema: {
          json: {
            type: "object",
            properties: {
              sql_id: {
                type: "string",
                description: "The SQL ID to look up (e.g., 'abc123def456'). This is the tokenized SQL identifier. If not provided, returns top SQL statements."
              },
              sql_db_id: {
                type: "string",
                description: "The SQL DB ID (database-specific identifier) to look up. Use this for non-tokenized SQL lookups."
              },
              sort_by: {
                type: "string",
                enum: ["load", "io_read", "io_write", "io"],
                description: "When listing top SQLs (no sql_id provided), sort by this metric. 'load' = database load (default), 'io_read' = blocks read per second, 'io_write' = blocks written per second, 'io' = combined read + write I/O."
              },
              limit: {
                type: "integer",
                description: "Maximum number of SQL statements to return when listing top SQLs. Defaults to 10."
              },
              snapshot: {
                type: "string",
                enum: ["primary", "secondary", "both"],
                description: "Which snapshot to query. Use 'primary' for single snapshot mode, 'secondary' for the comparison snapshot, or 'both' for compare mode to see data from both snapshots side by side. Defaults to 'primary'."
              }
            },
            required: []
          }
        }
      }
    },
    {
      toolSpec: {
        name: "get_os_metrics",
        description: "Get OS-level metrics like CPU utilization, memory usage, disk I/O, network traffic, and filesystem statistics. You can either: (1) provide a 'query' to search across all OS metrics and get relevant ones filtered automatically, (2) specify a 'category' to get all metrics in that category, or (3) specify both 'category' and 'metric_name' for a specific metric. Returns avg, max, min, and sum values.",
        inputSchema: {
          json: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "Describe what OS metrics you need (e.g., 'CPU usage statistics', 'memory consumption', 'disk read write throughput', 'network traffic'). The tool will automatically filter and return only relevant metrics. Use this when you're not sure which specific category or metric to query."
              },
              category: {
                type: "string",
                description: "Metric category to query (e.g., 'cpuUtilization', 'memory', 'diskIO', 'network', 'fileSys', 'swap'). If not specified and no query provided, returns a list of all available categories."
              },
              metric_name: {
                type: "string",
                description: "Specific metric name within the category (e.g., 'user', 'system', 'idle' for cpuUtilization). Requires category to be specified."
              },
              snapshot: {
                type: "string",
                enum: ["primary", "secondary", "both"],
                description: "Which snapshot to query. Use 'primary' for single snapshot mode, 'secondary' for the comparison snapshot, or 'both' for compare mode. Defaults to 'primary'."
              }
            },
            required: []
          }
        }
      }
    },
    {
      toolSpec: {
        name: "get_db_metrics",
        description: "Get database-level metrics like connections, transactions, buffer usage, checkpoint activity, tuples processed, and replication statistics. You can either: (1) provide a 'query' to search across all DB metrics and get relevant ones filtered automatically, (2) specify a 'category' to get all metrics in that category, or (3) specify both 'category' and 'metric_name' for a specific metric. Returns avg, max, min, and sum values.",
        inputSchema: {
          json: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "Describe what database metrics you need (e.g., 'connection counts', 'transaction statistics', 'buffer pool usage', 'tuple operations', 'checkpoint activity'). The tool will automatically filter and return only relevant metrics. Use this when you're not sure which specific category or metric to query."
              },
              category: {
                type: "string",
                description: "Metric category to query (e.g., 'Connections', 'Transactions', 'BufferPool', 'Checkpoints', 'Replication', 'Tuples'). If not specified and no query provided, returns a list of all available categories."
              },
              metric_name: {
                type: "string",
                description: "Specific metric name within the category. Requires category to be specified."
              },
              snapshot: {
                type: "string",
                enum: ["primary", "secondary", "both"],
                description: "Which snapshot to query. Use 'primary' for single snapshot mode, 'secondary' for the comparison snapshot, or 'both' for compare mode. Defaults to 'primary'."
              }
            },
            required: []
          }
        }
      }
    },
    {
      toolSpec: {
        name: "get_instance_config",
        description: "Get instance configuration details including instance class, engine type and version, storage type, allocated storage, cluster information, availability zone, and other general instance information. Use this tool when the user asks about the database setup, instance size, engine version, storage configuration, or cluster details.",
        inputSchema: {
          json: {
            type: "object",
            properties: {
              fields: {
                type: "array",
                items: { type: "string" },
                description: "Specific configuration fields to return (e.g., ['DBInstanceClass', 'Engine', 'EngineVersion', 'StorageType', 'AllocatedStorage']). If not specified or empty, returns all configuration fields."
              },
              snapshot: {
                type: "string",
                enum: ["primary", "secondary", "both"],
                description: "Which snapshot to query. Use 'primary' for single snapshot mode, 'secondary' for the comparison snapshot, or 'both' for compare mode to highlight configuration differences. Defaults to 'primary'."
              }
            },
            required: []
          }
        }
      }
    },
    {
      toolSpec: {
        name: "get_wait_events",
        description: "Get wait event information showing what the database is waiting on. Returns top wait events with event name, event type (e.g., 'CPU', 'IO', 'Lock'), time in seconds, and percentage of total DB time. Can also look up a specific wait event by name to get its statistics and description. Use this tool when the user asks about database waits, bottlenecks, or what the database is spending time on.",
        inputSchema: {
          json: {
            type: "object",
            properties: {
              event_name: {
                type: "string",
                description: "Specific wait event name to look up (e.g., 'CPU', 'IO:DataFileRead', 'Lock:transactionid'). If not specified, returns all top wait events."
              },
              snapshot: {
                type: "string",
                enum: ["primary", "secondary", "both"],
                description: "Which snapshot to query. Use 'primary' for single snapshot mode, 'secondary' for the comparison snapshot, or 'both' for compare mode. Defaults to 'primary'."
              }
            },
            required: []
          }
        }
      }
    },
    {
      toolSpec: {
        name: "get_parameters",
        description: "Get database parameter settings, specifically non-default parameters that have been customized from their default values. Can look up a specific parameter by name to get its current value. If a parameter is not in the non-default list, it indicates the parameter is using its default value. Use this tool when the user asks about database configuration parameters, settings, or tuning options.",
        inputSchema: {
          json: {
            type: "object",
            properties: {
              parameter_name: {
                type: "string",
                description: "Specific parameter name to look up (e.g., 'shared_buffers', 'work_mem', 'max_connections'). If not specified, returns all non-default parameters."
              },
              snapshot: {
                type: "string",
                enum: ["primary", "secondary", "both"],
                description: "Which snapshot to query. Use 'primary' for single snapshot mode, 'secondary' for the comparison snapshot, or 'both' for compare mode to highlight parameter differences. Defaults to 'primary'."
              }
            },
            required: []
          }
        }
      }
    },
    {
      toolSpec: {
        name: "get_activity_stats",
        description: "Get instance activity statistics including Average Active Sessions (AAS), DB Time in seconds, and wall clock time. These are high-level workload indicators. AAS represents the average number of sessions actively running at any point in time. DB Time is the total time spent by all sessions. Use this tool when the user asks about overall database activity, workload level, or AAS.",
        inputSchema: {
          json: {
            type: "object",
            properties: {
              snapshot: {
                type: "string",
                enum: ["primary", "secondary", "both"],
                description: "Which snapshot to query. Use 'primary' for single snapshot mode, 'secondary' for the comparison snapshot, or 'both' for compare mode. Defaults to 'primary'."
              }
            },
            required: []
          }
        }
      }
    },
    {
      toolSpec: {
        name: "save_conversation_report",
        description: "Save the current conversation as a markdown report file. Use this tool when the user asks to save the conversation, create a report, or export the analysis. The report will include a summary of the conversation, key findings, and recommendations discussed. The file is saved to the reports directory with the snapshot name.",
        inputSchema: {
          json: {
            type: "object",
            properties: {
              title: {
                type: "string",
                description: "Title for the report. If not provided, a default title based on the snapshot will be used."
              },
              summary: {
                type: "string",
                description: "A comprehensive summary of the conversation including key findings, analysis performed, and recommendations. This should capture the main points discussed in the chat session."
              }
            },
            required: ["summary"]
          }
        }
      }
    },
    {
      toolSpec: {
        name: "get_event_descriptions",
        description: "Get descriptions for PostgreSQL wait events or metrics from the knowledge base. Use this tool when you need detailed explanations of wait events, their causes, and recommended actions. If an event is not found in the knowledge base, the tool will suggest using MCP tools (like AWS documentation) to find more information.",
        inputSchema: {
          json: {
            type: "object",
            properties: {
              event_names: {
                type: "array",
                items: { type: "string" },
                description: "Array of event names to look up (e.g., ['cpu', 'io:datafileread', 'lock:relation']). Event names are case-insensitive."
              }
            },
            required: ["event_names"]
          }
        }
      }
    },
    {
      toolSpec: {
        name: "get_workload_analysis",
        description: "Get workload analysis for provisioned instances including: (1) actual resource usage during snapshot period (vCPUs, network throughput, memory, local storage, connections), (2) current instance capacity limits, and (3) recommended instance types that would fit the workload. The 'resource_reserve_pct' indicates the safety margin (e.g., 15% means recommendations leave 15% headroom). The 'usage_stats_based_on' indicates whether stats are based on 'max' or 'avg' values from the snapshot period. Use this tool when the user asks about instance sizing, rightsizing, capacity planning, or instance recommendations.",
        inputSchema: {
          json: {
            type: "object",
            properties: {
              snapshot: {
                type: "string",
                enum: ["primary", "secondary", "both"],
                description: "Which snapshot to query. Use 'primary' for single snapshot mode, 'secondary' for the comparison snapshot, or 'both' for compare mode. Defaults to 'primary'."
              }
            },
            required: []
          }
        }
      }
    },
    {
      toolSpec: {
        name: "get_current_time",
        description: "Get the current system date and time. Returns ISO format, UTC, local time, Unix timestamp, and timezone offset. Use this when you need to know the current time for context or calculations.",
        inputSchema: {
          json: {
            type: "object",
            properties: {},
            required: []
          }
        }
      }
    }
  ]
};

module.exports = { toolConfig };
