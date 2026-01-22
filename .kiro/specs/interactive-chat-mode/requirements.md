# Requirements Document

## Introduction

This document defines the requirements for adding an interactive chat mode to pireporter. The feature allows users to engage in a conversational interface with their performance reports after LLM recommendations are generated. Users can ask natural language questions about the data, and the LLM will reason about which tools to invoke to retrieve specific parts of the snapshot JSON data while using engine-specific knowledge to provide contextual answers.

## Glossary

- **Chat_Session**: An interactive conversation loop where users can ask natural language questions about performance data
- **Snapshot**: A JSON file containing captured performance metrics, wait events, SQL statistics, and configuration data from an RDS instance
- **Tool**: A function that the LLM can invoke to retrieve specific data from the snapshot when it determines that data is needed to answer a question
- **Knowledge_Base**: Engine-specific documentation files (e.g., aurora-postgresql.txt) containing tuning guidance and wait event descriptions
- **Compare_Report**: A report that analyzes two snapshots side-by-side to identify differences
- **Single_Report**: A report analyzing a single snapshot
- **LLM_Generator**: The existing class in genai.js that handles Bedrock model interactions

## Requirements

### Requirement 1: Chat Session Activation

**User Story:** As a user, I want to enter an interactive chat mode to ask questions about my performance data, so that I can get deeper insights beyond the generated recommendations.

#### Acceptance Criteria

1. WHEN the `--chat` flag is used with `--create-report` or `--create-compare-report`, THE System SHALL enter interactive chat mode after recommendations are displayed
2. WHEN the `--chat` flag is used without `--ai-analyzes`, THE System SHALL automatically enable AI analysis before entering chat mode
3. WHEN the chat session starts, THE Chat_Session SHALL initialize with the snapshot data and knowledge base loaded
4. WHEN the chat session starts, THE System SHALL display a welcome message explaining available capabilities
5. WHEN a user types "exit" or "quit", THE Chat_Session SHALL terminate gracefully
6. THE `--chat` option SHALL be documented in the CLI help with alias `-t`

### Requirement 2: SQL Statement Query Tool

**User Story:** As a developer, I want the LLM to have a tool to retrieve SQL statement statistics, so that it can answer user questions that require SQL performance data.

#### Acceptance Criteria

1. WHEN the LLM determines it needs SQL data to answer a question, THE LLM SHALL invoke the SQL stats tool with the appropriate SQL ID
2. WHEN the SQL stats tool is invoked with a sql_id, THE Tool SHALL return the matching SQL statement's statistics including dbload, pct_aas, additional metrics, SQL text, load by database, load by user, and wait event breakdown
3. WHEN the SQL stats tool is invoked with a sql_db_id (tokenized), THE Tool SHALL return statistics for the matching tokenized statement
4. IF the requested SQL ID is not found, THEN THE Tool SHALL return an appropriate "not found" message for the LLM to interpret
5. WHEN querying SQL stats in compare mode, THE Tool SHALL return data from both snapshots with clear labeling

### Requirement 3: OS Metrics Query Tool

**User Story:** As a developer, I want the LLM to have a tool to retrieve OS metrics, so that it can answer user questions about system-level resource utilization.

#### Acceptance Criteria

1. WHEN the LLM determines it needs OS metrics to answer a question, THE LLM SHALL invoke the OS metrics tool
2. WHEN the OS metrics tool is invoked with a metric category, THE Tool SHALL return all metrics within that category with avg, max, min, and sum values
3. WHEN the OS metrics tool is invoked with a specific metric name, THE Tool SHALL return that metric's statistics
4. IF the requested OS metric is not found, THEN THE Tool SHALL return an appropriate "not found" message for the LLM to interpret
5. WHEN querying OS metrics in compare mode, THE Tool SHALL return data from both snapshots with clear labeling

### Requirement 4: DB Metrics Query Tool

**User Story:** As a developer, I want the LLM to have a tool to retrieve database metrics, so that it can answer user questions about database-level performance indicators.

#### Acceptance Criteria

1. WHEN the LLM determines it needs DB metrics to answer a question, THE LLM SHALL invoke the DB metrics tool
2. WHEN the DB metrics tool is invoked with a metric category, THE Tool SHALL return all metrics within that category with avg, max, min, and sum values
3. WHEN the DB metrics tool is invoked with a specific metric name, THE Tool SHALL return that metric's statistics
4. IF the requested DB metric is not found, THEN THE Tool SHALL return an appropriate "not found" message for the LLM to interpret
5. WHEN querying DB metrics in compare mode, THE Tool SHALL return data from both snapshots with clear labeling

### Requirement 5: Instance Configuration Query Tool

**User Story:** As a developer, I want the LLM to have a tool to retrieve instance configuration, so that it can answer user questions about database setup and resource allocation.

#### Acceptance Criteria

1. WHEN the LLM determines it needs configuration data to answer a question, THE LLM SHALL invoke the instance configuration tool
2. WHEN the instance configuration tool is invoked, THE Tool SHALL return general information including instance class, engine version, storage type, and cluster details
3. WHEN the tool is invoked with specific field names, THE Tool SHALL return only the requested fields
4. WHEN querying configuration in compare mode, THE Tool SHALL return data from both snapshots highlighting differences

### Requirement 6: Wait Event Query Tool

**User Story:** As a developer, I want the LLM to have a tool to retrieve wait event information, so that it can answer user questions about what the database is waiting on.

#### Acceptance Criteria

1. WHEN the LLM determines it needs wait event data to answer a question, THE LLM SHALL invoke the wait event tool
2. WHEN the wait event tool is invoked, THE Tool SHALL return top wait events with event name, type, time in seconds, and percentage of DB time
3. WHEN the tool is invoked with a specific event name, THE Tool SHALL return that event's statistics and description from the knowledge base
4. IF the requested wait event is not found, THEN THE Tool SHALL return an appropriate "not found" message for the LLM to interpret
5. WHEN querying wait events in compare mode, THE Tool SHALL return data from both snapshots with clear labeling

### Requirement 7: Parameter Settings Query Tool

**User Story:** As a developer, I want the LLM to have a tool to retrieve parameter settings, so that it can answer user questions about database configuration.

#### Acceptance Criteria

1. WHEN the LLM determines it needs parameter data to answer a question, THE LLM SHALL invoke the parameter tool
2. WHEN the parameter tool is invoked, THE Tool SHALL return all non-default parameters
3. WHEN the tool is invoked with a specific parameter name, THE Tool SHALL return that parameter's current value
4. IF the requested parameter is not in the non-default list, THEN THE Tool SHALL indicate it is using the default value
5. WHEN querying parameters in compare mode, THE Tool SHALL return data from both snapshots highlighting differences

### Requirement 8: Knowledge Base Integration

**User Story:** As a user, I want the LLM to use engine-specific knowledge when answering questions, so that I receive accurate and contextual recommendations.

#### Acceptance Criteria

1. WHEN the Chat_Session initializes, THE System SHALL load the appropriate knowledge base file based on the database engine
2. WHEN the LLM generates responses, THE System SHALL include relevant knowledge base context in the system prompt
3. WHEN wait events are discussed, THE System SHALL include event descriptions from events.json and events_primary.json

### Requirement 9: Conversation Context Management

**User Story:** As a user, I want the chat to maintain conversation context, so that I can have a coherent multi-turn dialogue.

#### Acceptance Criteria

1. WHEN the Chat_Session starts, THE System SHALL load the initial LLM-generated report into the conversation context
2. WHEN a user asks a follow-up question, THE Chat_Session SHALL include previous conversation history in the context
3. WHEN conversation history exceeds token limits, THE Chat_Session SHALL summarize older messages while preserving recent context
4. THE Chat_Session SHALL maintain tool call results in context for reference in subsequent questions

### Requirement 10: LLM Tool Use and Reasoning

**User Story:** As a user, I want to ask natural language questions and have the LLM figure out what data it needs, so that I don't need to know the internal data structure.

#### Acceptance Criteria

1. THE System SHALL define tool schemas compatible with Bedrock's tool use format
2. WHEN the LLM receives a user question, THE LLM SHALL reason about which tools (if any) are needed to answer the question
3. WHEN the LLM decides to use a tool, THE System SHALL parse the tool call, execute it, and return results to the LLM
4. THE System SHALL support multiple sequential tool calls within a single user question when the LLM determines multiple data sources are needed
5. IF a tool call fails, THEN THE System SHALL return an error message to the LLM for graceful handling
6. WHEN the LLM has gathered sufficient data, THE LLM SHALL synthesize the information and provide a natural language response to the user
