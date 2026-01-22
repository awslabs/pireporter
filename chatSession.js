/**
 * ChatSession - Interactive chat mode for pireporter
 * 
 * Manages an interactive conversation loop where users can ask natural language
 * questions about their performance reports. The LLM uses Bedrock's Converse API
 * with tool use capabilities to query specific parts of the snapshot data.
 * Supports streaming responses for real-time output.
 * Supports MCP (Model Context Protocol) tools for external integrations.
 * 
 * @module chatSession
 */

'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { ToolExecutor } = require('./toolExecutor');
const { converseWithTools, converseWithToolsStreaming } = require('./converseClient');
const { toolConfig } = require('./toolDefinitions');
const { BedrockRuntimeClient } = require("@aws-sdk/client-bedrock-runtime");
const { MCPClient } = require('./mcpClient');

// Load configuration for Bedrock region and MCP
let conf = {};
if (fs.existsSync('./conf.json')) {
  conf = JSON.parse(fs.readFileSync('./conf.json', 'utf8'));
}

/**
 * Formats markdown tables for terminal display.
 * Detects markdown table syntax and renders with proper alignment and borders.
 * 
 * @param {string} text - Text that may contain markdown tables
 * @returns {string} Text with tables formatted for terminal
 */
function formatMarkdownTables(text) {
  // Regex to match markdown tables
  const tableRegex = /(\|[^\n]+\|\n)(\|[-:| ]+\|\n)((?:\|[^\n]+\|\n?)+)/g;
  
  return text.replace(tableRegex, (match, headerRow, separatorRow, bodyRows) => {
    // Parse header
    const headers = headerRow.split('|').slice(1, -1).map(h => h.trim());
    
    // Parse alignment from separator row
    const alignments = separatorRow.split('|').slice(1, -1).map(sep => {
      sep = sep.trim();
      if (sep.startsWith(':') && sep.endsWith(':')) return 'center';
      if (sep.endsWith(':')) return 'right';
      return 'left';
    });
    
    // Parse body rows
    const rows = bodyRows.trim().split('\n').map(row => 
      row.split('|').slice(1, -1).map(cell => cell.trim())
    );
    
    // Calculate column widths
    const colWidths = headers.map((h, i) => {
      const cellWidths = rows.map(row => (row[i] || '').length);
      return Math.max(h.length, ...cellWidths);
    });
    
    // Helper to pad cell content
    const padCell = (content, width, align) => {
      // Remove markdown formatting for width calculation
      const stripped = content.replace(/\*\*/g, '').replace(/\*/g, '').replace(/_/g, '');
      const displayContent = content.replace(/\*\*/g, '').replace(/\*/g, '').replace(/_/g, ''); // Also strip for display
      const padding = width - stripped.length;
      if (padding < 0) return displayContent.substring(0, width);
      if (align === 'center') {
        const left = Math.floor(padding / 2);
        return ' '.repeat(left) + displayContent + ' '.repeat(padding - left);
      } else if (align === 'right') {
        return ' '.repeat(padding) + displayContent;
      }
      return displayContent + ' '.repeat(padding);
    };
    
    // Build formatted table
    const horizontalLine = '─';
    const topBorder = '┌' + colWidths.map(w => horizontalLine.repeat(w + 2)).join('┬') + '┐';
    const headerSep = '├' + colWidths.map(w => horizontalLine.repeat(w + 2)).join('┼') + '┤';
    const bottomBorder = '└' + colWidths.map(w => horizontalLine.repeat(w + 2)).join('┴') + '┘';
    
    const formatRow = (cells) => {
      return '│ ' + cells.map((cell, i) => 
        padCell(cell || '', colWidths[i], alignments[i])
      ).join(' │ ') + ' │';
    };
    
    const formattedHeader = formatRow(headers);
    const formattedRows = rows.map(formatRow);
    
    return '\n' + [
      topBorder,
      formattedHeader,
      headerSep,
      ...formattedRows,
      bottomBorder
    ].join('\n') + '\n';
  });
}

/**
 * ChatSession class manages the interactive chat loop for querying performance data.
 * 
 * @class ChatSession
 */
class ChatSession {
  /**
   * Creates a new ChatSession instance.
   * 
   * @param {Object} options - Configuration options for the chat session
   * @param {string} options.type - Session type: 'single_snapshot' or 'compare'
   * @param {Object} options.snap1 - Primary snapshot data
   * @param {Object} [options.snap2] - Secondary snapshot data (for compare mode)
   * @param {string} options.report - LLM-generated report HTML
   * @param {Object} [options.llmAnalysis] - LLM analysis sections from report generation
   * @param {Object} [options.bedrockClient] - Optional Bedrock client (for testing)
   * @param {string} [options.modelId] - Optional model ID (defaults to Claude 3 Sonnet)
   * @param {number} [options.maxTokens] - Maximum token threshold before summarization (default: 80000)
   * @param {number} [options.recentMessagesToPreserve] - Number of recent messages to preserve during summarization (default: 6)
   */
  constructor(options) {
    this.type = options.type;           // 'single_snapshot' or 'compare'
    this.snap1 = options.snap1;         // Primary snapshot data
    this.snap2 = options.snap2;         // Secondary snapshot (for compare mode)
    this.initialReport = options.report; // LLM-generated report HTML
    this.llmAnalysis = options.llmAnalysis || null; // LLM analysis sections
    this.messages = [];                  // Conversation history
    this.knowledge = '';                 // Engine-specific knowledge
    this.eventDescriptions = {};         // Wait event descriptions
    this.toolExecutor = null;            // Tool executor instance (initialized in initialize())
    this.bedrockClient = options.bedrockClient || null; // Bedrock client (lazy initialized)
    this.modelId = options.modelId || conf.bedrockModel?.value || 'anthropic.claude-3-sonnet-20240229-v1:0'; // Use same model as analysis
    this.mcpClient = null;               // MCP client (initialized if enabled)
    this.mcpEnabled = conf.mcpEnabled?.value || false; // MCP tools enabled flag
    
    // Context summarization configuration (Requirement 9.3)
    this.maxTokens = options.maxTokens || conf.chatMaxContextTokens?.value || 150000; // Default 150K to leave room for system prompt + response
    this.recentMessagesToPreserve = options.recentMessagesToPreserve || 6; // Default 6 messages = 3 turns
    
    // Token usage tracking
    this.totalInputTokens = 0;
    this.totalOutputTokens = 0;
    
    // Report context for saving conversation reports
    this.snapshotName = options.snapshotName || '';
    this.reportsDirectory = options.reportsDirectory || path.join(process.cwd(), 'reports');
  }

  /**
   * Initializes the chat session by loading the knowledge base and preparing context.
   * Loads engine-specific knowledge files and event descriptions.
   * 
   * @async
   * @returns {Promise<void>}
   */
  async initialize() {
    // Initialize empty messages array for conversation history (Requirement 9.1)
    this.messages = [];
    
    // Store initial report in context (Requirement 9.1)
    // The initialReport is already set in constructor, but we ensure it's available
    if (!this.initialReport) {
      this.initialReport = '';
    }
    
    // Initialize Bedrock client early (needed for knowledge base compression)
    if (!this.bedrockClient) {
      this.bedrockClient = new BedrockRuntimeClient({ region: conf.bedrockRegion?.value });
    }
    
    // Load engine-specific knowledge base file (Requirement 8.1)
    const engine = this.snap1?.GeneralInformation?.Engine;
    if (engine) {
      const knowledgeBasePath = path.join(__dirname, 'genai', 'knowledge_base', `${engine}.txt`);
      if (fs.existsSync(knowledgeBasePath)) {
        const rawKnowledge = fs.readFileSync(knowledgeBasePath, 'utf8');
        // Compress knowledge base using LLM to preserve meaning while reducing size
        console.log(`\x1b[90m[Compressing engine knowledge base...]\x1b[0m`);
        this.knowledge = await this.compressText(rawKnowledge);
        console.log(`\x1b[90m[Knowledge base compressed: ${rawKnowledge.length} -> ${this.knowledge.length} chars]\x1b[0m`);
      } else {
        // Log warning but continue without knowledge base (graceful degradation)
        console.warn(`Knowledge base file not found for engine: ${engine}`);
        this.knowledge = '';
      }
    } else {
      this.knowledge = '';
    }
    
    // Load event descriptions from events.json and events_primary.json (Requirement 8.2)
    this.eventDescriptions = {};
    
    // Load events.json - contains event name to description mapping
    const eventsPath = path.join(__dirname, 'genai', 'knowledge_base', 'events.json');
    if (fs.existsSync(eventsPath)) {
      try {
        const eventsData = JSON.parse(fs.readFileSync(eventsPath, 'utf8'));
        // events.json is a simple object mapping event names to descriptions
        Object.assign(this.eventDescriptions, eventsData);
      } catch (error) {
        console.warn(`Failed to load events.json: ${error.message}`);
      }
    }
    
    // Load events_primary.json - contains detailed event descriptions
    const eventsPrimaryPath = path.join(__dirname, 'genai', 'knowledge_base', 'events_primary.json');
    if (fs.existsSync(eventsPrimaryPath)) {
      try {
        const eventsPrimaryData = JSON.parse(fs.readFileSync(eventsPrimaryPath, 'utf8'));
        // events_primary.json is an array of objects with 'events' array and 'value' description
        // We need to map each event name to its detailed description
        for (const entry of eventsPrimaryData) {
          if (entry.events && Array.isArray(entry.events) && entry.value) {
            for (const eventName of entry.events) {
              // Primary descriptions override basic descriptions from events.json
              this.eventDescriptions[eventName] = entry.value;
            }
          }
        }
      } catch (error) {
        console.warn(`Failed to load events_primary.json: ${error.message}`);
      }
    }
    
    // Initialize the ToolExecutor with event descriptions
    this.toolExecutor = new ToolExecutor(this.snap1, this.snap2, this.eventDescriptions);
    
    // Set report context for save_conversation_report tool
    this.toolExecutor.setReportContext({
      snapshotName: this.snapshotName,
      reportsDirectory: this.reportsDirectory,
      messages: this.messages
    });
    
    // Set Bedrock client for tool executor (needed for lightweight LLM filtering)
    const lightweightModelId = conf.bedrockModelLightweight?.value;
    if (lightweightModelId) {
      this.toolExecutor.setBedrockClient(this.bedrockClient, lightweightModelId);
    }
    
    // Initialize MCP client if enabled
    if (this.mcpEnabled) {
      this.mcpClient = new MCPClient();
      await this.mcpClient.initialize();
    }
  }

  /**
   * Begins the REPL (Read-Eval-Print Loop) for interactive chat.
   * Displays welcome message and handles user input until exit.
   * 
   * @async
   * @returns {Promise<void>}
   */
  async start() {
    // Display welcome message explaining available capabilities (Requirement 1.4)
    this.displayWelcomeMessage();
    
    // Create readline interface for user input
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    // Store readline interface for cleanup
    this.rl = rl;
    
    // REPL loop using recursive prompting
    const promptUser = () => {
      rl.question('\n\x1b[34mYou:\x1b[0m ', async (input) => {
        // Trim whitespace from input
        const trimmedInput = input.trim();
        
        // Check for exit/quit commands (Requirement 1.5)
        if (trimmedInput.toLowerCase() === 'exit' || trimmedInput.toLowerCase() === 'quit') {
          console.log('\nGoodbye! Thank you for using pireporter chat mode.');
          this.end();
          rl.close();
          return;
        }
        
        // Skip empty input
        if (trimmedInput === '') {
          promptUser();
          return;
        }
        
        // Process the user's question
        try {
          await this.processUserInput(trimmedInput);
        } catch (error) {
          console.error(`\nError processing your question: ${error.message}`);
        }
        
        // Continue the loop
        promptUser();
      });
    };
    
    // Start the prompt loop
    promptUser();
    
    // Return a promise that resolves when the readline interface closes
    return new Promise((resolve) => {
      rl.on('close', () => {
        resolve();
      });
    });
  }

  /**
   * Displays the welcome message with available capabilities.
   * Shows the LLM analysis summary if available.
   * 
   * @private
   * @returns {void}
   */
  displayWelcomeMessage() {
    const modeDescription = this.type === 'compare' 
      ? 'comparing two snapshots' 
      : 'analyzing a single snapshot';
    
    const engine = this.snap1?.GeneralInformation?.Engine || 'database';
    const region = conf.bedrockRegion?.value || 'not configured';
    const lightweightModel = conf.bedrockModelLightweight?.value || 'not configured';
    
    console.log('\n' + '='.repeat(70));
    console.log('Welcome to pireporter Interactive Chat Mode');
    console.log('='.repeat(70));
    console.log(`\nYou are ${modeDescription} for ${engine}.`);
    
    // Display only the grand summary part of LLM analysis (not all sections)
    if (this.llmAnalysis) {
      const summaryKey = this.type === 'compare' ? 'compare_summary' : 'single_summary';
      const fullSummary = this.llmAnalysis[summaryKey];
      if (fullSummary) {
        // Extract only the grand summary part (before <h2>General information:</h2>)
        // The full summary contains: grand summary + all section summaries
        let grandSummary = fullSummary;
        const sectionStart = fullSummary.indexOf('<h2>General information:</h2>');
        if (sectionStart > 0) {
          grandSummary = fullSummary.substring(0, sectionStart).trim();
        }
        
        console.log('\n' + '-'.repeat(70));
        console.log('\x1b[34mAI Analysis Summary:\x1b[0m');
        console.log('-'.repeat(70));
        console.log(grandSummary);
        console.log('-'.repeat(70));
      }
    }
    
    console.log('\nI can help you explore your performance data and find correlations between your queries and stats.');
    console.log('\nExamples of questions you can ask:');
    console.log('  - "Find correlations between top SQLs and instance stats."');
    console.log('  - "Show me the SQL with the highest load"');
    console.log('  - "What is the CPU utilization?"');
    console.log('  - "Are there any non-default parameters?"');
    console.log('\nIf you want to provide me some data like DDL, or execution plan, or some other content in a file');
    console.log('Use @ decorator:');
    console.log('   Check the file @filename - For files in current directory');
    console.log('   Check the file @file_absolute_path - For files in other directory');
    console.log('\nYou can ask me to "save the conversation" to export our discussion as a markdown report.');
    console.log('\nType "exit" or "quit" to end the chat session.');
    console.log('-'.repeat(70));
    
    // Show configuration info at the end
    console.log(`\x1b[90m[Region: ${region} | Model: ${this.modelId}]\x1b[0m`);
    console.log(`\x1b[90m[Lightweight model: ${lightweightModel}]\x1b[0m`);
    
    // Show MCP status if enabled
    if (this.mcpEnabled && this.mcpClient) {
      const mcpToolCount = this.mcpClient.tools.size;
      if (mcpToolCount > 0) {
        const toolNames = Array.from(this.mcpClient.tools.keys()).join(', ');
        console.log(`\x1b[90m[MCP: ${mcpToolCount} external tools available (${toolNames})]\x1b[0m`);
      }
    }
  }

  /**
   * Processes a user's input question.
   * Sends the question to the LLM and handles tool use if needed.
   * Uses streaming for real-time response output.
   * 
   * Implements the core conversation loop:
   * 1. Creates a user message and adds it to the messages array (Requirement 9.2)
   * 2. Calls converseWithToolsStreaming with current context (Requirement 10.2)
   * 3. Handles tool_use stop reason with tool execution loop (Requirement 10.3, 10.4)
   * 4. Handles end_turn stop reason by displaying response (Requirement 10.6)
   * 5. Adds assistant response to messages array (Requirement 9.2)
   * 
   * @async
   * @param {string} input - The user's question or command
   * @returns {Promise<string>} The assistant's final text response
   */
  async processUserInput(input) {
    // Handle debug commands
    if (input.trim() === 'DEBUG=system_prompt') {
      const systemPrompt = this.buildSystemPrompt();
      console.log('\n\x1b[90m--- SYSTEM PROMPT START ---\x1b[0m');
      console.log(systemPrompt);
      console.log('\x1b[90m--- SYSTEM PROMPT END ---\x1b[0m');
      return '';
    }
    
    // Process @filename references to include file contents
    const processedInput = this.processFileReferences(input);
    
    // 1. Create user message and add to messages array (Requirement 9.2)
    const userMessage = {
      role: 'user',
      content: [{ text: processedInput }]
    };
    this.messages.push(userMessage);
    
    // Ensure Bedrock client is initialized
    if (!this.bedrockClient) {
      this.bedrockClient = new BedrockRuntimeClient({ region: conf.bedrockRegion?.value });
    }
    
    // Build the system prompt
    const systemPrompt = this.buildSystemPrompt();
    
    // Get combined tool config (built-in + MCP tools)
    const currentToolConfig = this.getToolConfig();
    
    // Track if we've started printing the response
    let responseStarted = false;
    let fullResponseText = ''; // Buffer for table detection
    
    // Callback for streaming text chunks
    const onTextChunk = (chunk) => {
      if (!responseStarted) {
        process.stdout.write('\n\x1b[32mAssistant:\x1b[0m ');
        responseStarted = true;
      }
      fullResponseText += chunk;
      process.stdout.write(chunk);
    };
    
    // Helper to call LLM with retry on "input too long" error
    const callLLMWithRetry = async () => {
      try {
        return await converseWithToolsStreaming(
          this.bedrockClient,
          this.modelId,
          this.messages,
          systemPrompt,
          currentToolConfig,
          onTextChunk
        );
      } catch (error) {
        // Check if it's an "input too long" error
        if (error.message && error.message.includes('Input is too long')) {
          console.log('\n\x1b[33m[Context too large, summarizing older messages...]\x1b[0m');
          
          // Force summarization by temporarily lowering the threshold
          const originalMaxTokens = this.maxTokens;
          this.maxTokens = 1; // Force summarization
          const summarized = await this.summarizeHistory();
          this.maxTokens = originalMaxTokens;
          
          if (summarized) {
            console.log('\x1b[33m[Summarization complete, retrying...]\x1b[0m');
            // Retry the call after summarization
            return await converseWithToolsStreaming(
              this.bedrockClient,
              this.modelId,
              this.messages,
              systemPrompt,
              currentToolConfig,
              onTextChunk
            );
          } else {
            // If we couldn't summarize (not enough messages), re-throw
            throw new Error('Context is too large and cannot be summarized further. Try starting a new chat session.');
          }
        }
        throw error;
      }
    };
    
    // 2. Call converseWithToolsStreaming with current context (Requirement 10.2)
    let response = await callLLMWithRetry();
    
    // Track token usage
    if (response.usage) {
      this.totalInputTokens += response.usage.inputTokens || 0;
      this.totalOutputTokens += response.usage.outputTokens || 0;
    }
    
    // 3. Handle tool_use stop reason with tool execution loop (Requirements 10.3, 10.4)
    while (response.stopReason === 'tool_use') {
      // Add the assistant's tool use message to conversation history
      const assistantMessage = response.output?.message;
      if (assistantMessage) {
        this.messages.push(assistantMessage);
      }
      
      // Execute tools and get tool result message (async for MCP tools)
      const toolResultMessage = await this.handleToolUseResponse(response);
      
      if (toolResultMessage) {
        // Add tool results to conversation history (Requirement 9.4)
        this.messages.push(toolResultMessage);
        
        // Reset for next streaming response (but keep fullResponseText accumulating)
        responseStarted = false;
        
        // Call the LLM again with tool results (streaming), with retry on context overflow
        try {
          response = await converseWithToolsStreaming(
            this.bedrockClient,
            this.modelId,
            this.messages,
            systemPrompt,
            currentToolConfig,
            onTextChunk
          );
        } catch (error) {
          // Check if it's an "input too long" error
          if (error.message && error.message.includes('Input is too long')) {
            console.log('\n\x1b[33m[Context too large, summarizing older messages...]\x1b[0m');
            
            // Force summarization
            const originalMaxTokens = this.maxTokens;
            this.maxTokens = 1;
            const summarized = await this.summarizeHistory();
            this.maxTokens = originalMaxTokens;
            
            if (summarized) {
              console.log('\x1b[33m[Summarization complete, retrying...]\x1b[0m');
              response = await converseWithToolsStreaming(
                this.bedrockClient,
                this.modelId,
                this.messages,
                systemPrompt,
                currentToolConfig,
                onTextChunk
              );
            } else {
              throw new Error('Context is too large and cannot be summarized further. Try starting a new chat session.');
            }
          } else {
            throw error;
          }
        }
        
        // Track token usage for each call in the loop
        if (response.usage) {
          this.totalInputTokens += response.usage.inputTokens || 0;
          this.totalOutputTokens += response.usage.outputTokens || 0;
        }
      } else {
        // No tool use blocks found, break the loop
        break;
      }
    }
    
    // Add newline after streaming completes
    if (responseStarted) {
      console.log('');
      
      // Check if response contains markdown tables and reprint them formatted
      const tableRegex = /\|[^\n]+\|\n\|[-:| ]+\|\n(?:\|[^\n]+\|\n?)+/g;
      if (tableRegex.test(fullResponseText)) {
        console.log('\n\x1b[90m--- Formatted Tables ---\x1b[0m');
        const formattedText = formatMarkdownTables(fullResponseText);
        // Extract only the table parts using box-drawing characters
        const formattedTableRegex = /┌[^┘]+┘/gs;
        const tables = formattedText.match(formattedTableRegex);
        if (tables) {
          tables.forEach(table => console.log(table));
        }
      }
    }
    
    // 4. Extract response text for return value
    let responseText = '';
    if (response.stopReason === 'end_turn') {
      // Extract text from the response
      const assistantContent = response.output?.message?.content;
      if (assistantContent && Array.isArray(assistantContent)) {
        for (const block of assistantContent) {
          if (block.text) {
            responseText += block.text;
          }
        }
      }
    }
    
    // 5. Add assistant response to messages array (Requirement 9.2)
    const finalAssistantMessage = response.output?.message;
    if (finalAssistantMessage) {
      this.messages.push(finalAssistantMessage);
    }
    
    // 6. Check if context summarization is needed (Requirement 9.3)
    await this.summarizeHistory();
    
    // 7. Display context and token stats
    const currentContextTokens = this.getTotalTokenCount();
    const pctToCompress = Math.max(0, ((currentContextTokens - this.maxTokens) / currentContextTokens * 100)).toFixed(1);
    const contextPct = (currentContextTokens / this.maxTokens * 100).toFixed(1);
    console.log(`\x1b[90m[Context: ${currentContextTokens.toLocaleString()} tokens (${contextPct}% of limit) | Session tokens cumulative: in=${this.totalInputTokens.toLocaleString()}, out=${this.totalOutputTokens.toLocaleString()}]\x1b[0m`);
    
    return responseText;
  }

  /**
   * Builds the system prompt for the LLM.
   * Includes essential context only - detailed data is accessed via tools.
   * 
   * @returns {string} The system prompt
   */
  buildSystemPrompt() {
    const engine = this.snap1?.GeneralInformation?.Engine || 'database';
    const modeDescription = this.type === 'compare' 
      ? 'comparing two performance snapshots' 
      : 'analyzing a single performance snapshot';
    
    let systemPrompt = `You are a database performance expert assistant helping users understand their ${engine} performance data from the database workload and stats snapshot or two sanpshots. You are ${modeDescription}.

You are available in interactive chat mode of the pireporter tool. PIReporter can generate snapshots for specified tyme periods, generate html reports from them and compare periods reports.

## Available Tools
- get_sql_stats: Get SQL statistics or list top SQLs
- get_os_metrics: Get OS metrics (CPU, memory, disk)
- get_db_metrics: Get database metrics (connections, transactions)
- get_instance_config: Get instance configuration
- get_wait_events: Get wait event information
- get_parameters: Get database parameters
- get_activity_stats: Get instance activity statistics
- get_event_descriptions: Get detailed wait event descriptions
- get_workload_analysis: Get resource usage, instance capacity, and instance recommendations (provisioned only)
- get_current_time: Get current system date and time
- save_conversation_report: Save conversation as markdown
`;

    // Include MCP tools if available (brief list only)
    if (this.mcpEnabled && this.mcpClient && this.mcpClient.tools.size > 0) {
      systemPrompt += `\n### External MCP Tools:\n`;
      for (const [toolName, toolInfo] of this.mcpClient.tools) {
        systemPrompt += `- ${toolName}\n`;
      }
    }

    systemPrompt += `
## Agentic Loop
Follow this pattern for every user question:
1. PLAN: Briefly state what data you need and which tools to call
2. EXECUTE: Call the necessary tools to gather data
3. REFLECT: Check if you have enough information to answer
4. REITERATE: If not, go back to step 1 with refined plan
5. ANSWER: Once you have sufficient data, provide complete answer

## Guidelines
- Use tools to query data - don't assume values
- Reference specific metrics in responses
- For compare mode, consider both snapshots
- Use visualizations when feasible
- Ask clarifying questions only if truly ambiguous
- User can provide information directly from text files using @filename decorator

DO NOT RESPOND TO NON-RELEVANT QUESTIONS.
`;

    // Include only the grand summary (condensed) if available
    if (this.llmAnalysis) {
      const summaryKey = this.type === 'compare' ? 'compare_summary' : 'single_summary';
      if (this.llmAnalysis[summaryKey]) {
        const fullSummary = this.llmAnalysis[summaryKey];
        let grandSummary = fullSummary;
        const sectionStart = fullSummary.indexOf('<h2>General information:</h2>');
        if (sectionStart > 0) {
          grandSummary = fullSummary.substring(0, sectionStart).trim();
        }
        // Limit to 2000 chars
        const truncated = grandSummary.length > 2000 
          ? grandSummary.substring(0, 2000) + '...[truncated]'
          : grandSummary;
        systemPrompt += `\n## Analysis Summary\n${truncated}\n`;
      }
    }
    
    // Include user-provided comments from snapshot metadata
    const comment1 = this.snap1?.$META$?.commandLineOptions?.comment;
    const comment2 = this.snap2?.$META$?.commandLineOptions?.comment;
    if (comment1 || comment2) {
      systemPrompt += `\n## User Context\n`;
      if (this.type === 'compare') {
        if (comment1) systemPrompt += `Snapshot 1 comment: "${comment1}"\n`;
        if (comment2) systemPrompt += `Snapshot 2 comment: "${comment2}"\n`;
      } else {
        if (comment1) systemPrompt += `User comment: "${comment1}"\n`;
      }
    }
    
    // Include derived/additional metrics (critical for analysis)
    systemPrompt += `Following are VERY CRITICAL derived metrics, consider them:` + this._formatAdditionalMetrics();
    
    // Include engine-specific knowledge base (already compressed during initialize)
    if (this.knowledge && this.knowledge.length > 0) {
      systemPrompt += `\n## Engine Knowledge Base\n${this.knowledge}\n`;
    }
    
    return systemPrompt;
  }

  /**
   * Formats additional/derived metrics for inclusion in system prompt.
   * These are critical computed metrics like buffer cache hit ratio, AAS ratios, etc.
   * 
   * @private
   * @returns {string} Formatted metrics section for system prompt
   */
  _formatAdditionalMetrics() {
    let metricsSection = '';
    
    // Format metrics for a single snapshot
    const formatSnapMetrics = (snap, label) => {
      const additionalMetrics = snap?.Metrics?.AdditionalMetrics;
      if (!additionalMetrics || Object.keys(additionalMetrics).length === 0) {
        return '';
      }
      
      let result = `\n## ${label} - Key Derived Metrics\n`;
      for (const [key, metric] of Object.entries(additionalMetrics)) {
        if (metric && metric.value !== undefined) {
          result += `- ${metric.label || key}: ${metric.value} ${metric.unit || ''}\n`;
        }
      }
      return result;
    };
    
    if (this.type === 'compare') {
      metricsSection += formatSnapMetrics(this.snap1, 'Snapshot 1');
      metricsSection += formatSnapMetrics(this.snap2, 'Snapshot 2');
    } else {
      metricsSection += formatSnapMetrics(this.snap1, 'Derived Metrics');
    }
    
    return metricsSection;
  }

  /**
   * Sends a user message to the LLM via Bedrock Converse API.
   * This is a lower-level method used by processUserInput().
   * 
   * @async
   * @param {string} userMessage - The message to send to the LLM
   * @returns {Promise<Object>} The LLM response
   */
  async sendToLLM(userMessage) {
    // Ensure Bedrock client is initialized
    if (!this.bedrockClient) {
      this.bedrockClient = new BedrockRuntimeClient({ region: conf.bedrockRegion?.value });
    }
    
    // Create the message in Bedrock format
    const message = {
      role: 'user',
      content: [{ text: userMessage }]
    };
    
    // Build the system prompt
    const systemPrompt = this.buildSystemPrompt();
    
    // Call the Converse API
    return await converseWithTools(
      this.bedrockClient,
      this.modelId,
      [...this.messages, message],
      systemPrompt,
      toolConfig
    );
  }

  /**
   * Executes a tool requested by the LLM.
   * 
   * @param {string} toolName - Name of the tool to execute
   * @param {Object} toolInput - Input parameters for the tool
   * @returns {Object} The tool execution result or error object
   */
  async executeTool(toolName, toolInput) {
    // Check if this is an MCP tool
    if (this.mcpClient && this.mcpClient.isMCPTool(toolName)) {
      try {
        const result = await this.mcpClient.executeTool(toolName, toolInput);
        return result;
      } catch (error) {
        return { error: `Error executing MCP tool ${toolName}: ${error.message}` };
      }
    }
    
    // Ensure tool executor is initialized for built-in tools
    if (!this.toolExecutor) {
      this.toolExecutor = new ToolExecutor(this.snap1, this.snap2, this.eventDescriptions);
    }
    
    // Update report context with latest messages before executing
    // (needed for save_conversation_report tool)
    this.toolExecutor.setReportContext({
      snapshotName: this.snapshotName,
      reportsDirectory: this.reportsDirectory,
      messages: this.messages
    });
    
    try {
      const result = this.toolExecutor.execute(toolName, toolInput);
      return result;
    } catch (error) {
      // Return error object instead of throwing to allow graceful handling
      return { error: `Error executing ${toolName}: ${error.message}` };
    }
  }

  /**
   * Formats a tool result for sending back to the LLM as a toolResult message.
   * 
   * @param {string} toolUseId - The unique ID of the tool use request
   * @param {Object} result - The raw tool execution result
   * @returns {Object} Formatted toolResult content block for LLM consumption
   */
  formatToolResult(toolUseId, result) {
    // Check if the result is an error
    if (result && result.error) {
      return {
        toolUseId: toolUseId,
        content: [{ text: result.error }],
        status: 'error'
      };
    }
    
    // Return successful result as JSON
    return {
      toolUseId: toolUseId,
      content: [{ json: result }]
    };
  }

  /**
   * Parses toolUse blocks from an LLM response content array.
   * Extracts all tool use requests from the response.
   * 
   * @param {Array<Object>} content - The content array from the LLM response
   * @returns {Array<Object>} Array of toolUse objects with toolUseId, name, and input
   */
  parseToolUseBlocks(content) {
    if (!content || !Array.isArray(content)) {
      return [];
    }
    
    const toolUseBlocks = [];
    
    for (const block of content) {
      if (block.toolUse) {
        toolUseBlocks.push({
          toolUseId: block.toolUse.toolUseId,
          name: block.toolUse.name,
          input: block.toolUse.input || {}
        });
      }
    }
    
    return toolUseBlocks;
  }

  /**
   * Executes all tool use requests and returns formatted tool result messages.
   * Handles multiple sequential tool calls in a single response.
   * 
   * @async
   * @param {Array<Object>} toolUseBlocks - Array of parsed toolUse blocks
   * @returns {Promise<Array<Object>>} Array of formatted toolResult content blocks
   */
  async executeToolCalls(toolUseBlocks) {
    const toolResults = [];
    
    // Display tool calls being made (visual feedback)
    const toolNames = toolUseBlocks.map(t => t.name).join(', ');
    console.log(`\n\x1b[90m[Calling tools: ${toolNames}]\x1b[0m`);
    
    for (const toolUse of toolUseBlocks) {
      // Execute the tool (may be async for MCP tools)
      const result = await this.executeTool(toolUse.name, toolUse.input);
      
      // Format the result
      const formattedResult = this.formatToolResult(toolUse.toolUseId, result);
      
      toolResults.push({ toolResult: formattedResult });
    }
    
    return toolResults;
  }

  /**
   * Creates a tool result message to send back to the LLM.
   * The message contains all tool results from the executed tool calls.
   * 
   * @param {Array<Object>} toolResults - Array of formatted toolResult content blocks
   * @returns {Object} A message object with role 'user' and toolResult content
   */
  createToolResultMessage(toolResults) {
    return {
      role: 'user',
      content: toolResults
    };
  }

  /**
   * Handles the complete tool execution loop for an LLM response.
   * Parses tool use blocks, executes all tools, and returns the tool result message.
   * 
   * This method implements the core logic for Requirements 10.3, 10.4, 10.5:
   * - Parses toolUse blocks from LLM response (10.3)
   * - Supports multiple sequential tool calls (10.4)
   * - Handles tool execution errors gracefully (10.5)
   * 
   * @async
   * @param {Object} llmResponse - The LLM response object from Bedrock Converse API
   * @returns {Promise<Object|null>} Tool result message to send back to LLM, or null if no tool use
   */
  async handleToolUseResponse(llmResponse) {
    // Check if the response has tool_use stop reason
    if (!llmResponse || llmResponse.stopReason !== 'tool_use') {
      return null;
    }
    
    // Get the assistant message content
    const assistantContent = llmResponse.output?.message?.content;
    if (!assistantContent) {
      return null;
    }
    
    // Parse all toolUse blocks from the response
    const toolUseBlocks = this.parseToolUseBlocks(assistantContent);
    
    if (toolUseBlocks.length === 0) {
      return null;
    }
    
    // Execute all tool calls (async for MCP tools)
    const toolResults = await this.executeToolCalls(toolUseBlocks);
    
    // Create and return the tool result message
    return this.createToolResultMessage(toolResults);
  }

  /**
   * Estimates the token count of a message or array of messages.
   * Uses a simple approximation of ~4 characters per token.
   * 
   * @param {Object|Array<Object>} messages - A single message or array of messages
   * @returns {number} Estimated token count
   */
  estimateTokenCount(messages) {
    const messagesArray = Array.isArray(messages) ? messages : [messages];
    let totalChars = 0;
    
    for (const message of messagesArray) {
      if (!message || !message.content) continue;
      
      // Handle content array (Bedrock format)
      if (Array.isArray(message.content)) {
        for (const block of message.content) {
          if (block.text) {
            totalChars += block.text.length;
          } else if (block.toolUse) {
            // Estimate tool use block size
            totalChars += JSON.stringify(block.toolUse).length;
          } else if (block.toolResult) {
            // Estimate tool result block size
            totalChars += JSON.stringify(block.toolResult).length;
          } else if (block.json) {
            totalChars += JSON.stringify(block.json).length;
          }
        }
      } else if (typeof message.content === 'string') {
        totalChars += message.content.length;
      }
    }
    
    // Approximate: ~4 characters per token
    return Math.ceil(totalChars / 4);
  }

  /**
   * Gets the current total token count of all messages in the conversation history.
   * 
   * @returns {number} Total estimated token count
   */
  getTotalTokenCount() {
    return this.estimateTokenCount(this.messages);
  }

  /**
   * Checks if the conversation history exceeds the configured token threshold.
   * Uses a lower threshold (70%) to trigger proactive summarization before hitting limits.
   * 
   * @returns {boolean} True if token count exceeds 70% of maxTokens threshold
   */
  needsSummarization() {
    // Trigger at 70% to leave room for LLM summarization call
    return this.getTotalTokenCount() > (this.maxTokens * 0.7);
  }

  /**
   * Checks if we're critically over the limit (emergency mode).
   * 
   * @returns {boolean} True if token count exceeds maxTokens
   */
  needsEmergencyTruncation() {
    return this.getTotalTokenCount() > this.maxTokens;
  }

  /**
   * Extracts text content from a message for summarization purposes.
   * 
   * @param {Object} message - A message object
   * @returns {string} Extracted text content
   */
  extractMessageText(message) {
    if (!message || !message.content) return '';
    
    const parts = [];
    const role = message.role || 'unknown';
    
    if (Array.isArray(message.content)) {
      for (const block of message.content) {
        if (block.text) {
          parts.push(block.text);
        } else if (block.toolUse) {
          parts.push(`[Tool call: ${block.toolUse.name}]`);
        } else if (block.toolResult) {
          // Summarize tool results briefly
          const status = block.toolResult.status === 'error' ? 'error' : 'success';
          parts.push(`[Tool result: ${status}]`);
        }
      }
    } else if (typeof message.content === 'string') {
      parts.push(message.content);
    }
    
    return `${role}: ${parts.join(' ')}`;
  }

  /**
   * Compresses a text prompt using LLM to reduce size while preserving meaning.
   * Uses a specialized compression prompt to achieve ~10x compression.
   * 
   * @async
   * @param {string} text - The text to compress
   * @returns {Promise<string>} Compressed text, or original if compression fails
   */
  async compressText(text) {
    // Skip compression for very short texts
    if (text.length < 200) {
      return text;
    }
    
    try {
      const compressionPrompt = `You are an LLM prompt compression software. You compress prompts 10 times, without losing meaning and expected output of the LLM for original prompt. You accept input prompt, and your output is compressed prompt. Output ONLY the compressed text, nothing else.

Prompt to compress:
${text}`;

      // Use advanced model for better compression quality
      const compressionModelId = this.modelId;
      
      // Use ConverseCommand directly without tools (empty toolConfig causes errors)
      const { ConverseCommand } = require("@aws-sdk/client-bedrock-runtime");
      const command = new ConverseCommand({
        modelId: compressionModelId,
        messages: [{ role: 'user', content: [{ text: compressionPrompt }] }],
        system: [{ text: 'You compress text while preserving meaning. Output only compressed text.' }],
        inferenceConfig: {
          maxTokens: 4096,
          temperature: 0.1
        }
      });
      
      const response = await this.bedrockClient.send(command);
      
      // Extract compressed text from response
      const content = response.output?.message?.content;
      if (content && Array.isArray(content)) {
        for (const block of content) {
          if (block.text) {
            return block.text.trim();
          }
        }
      }
      
      return text; // Return original if extraction fails
    } catch (error) {
      console.log(`\x1b[33m[Compression failed: ${error.message}]\x1b[0m`);
      return text; // Return original on error
    }
  }

  /**
   * Compresses a message object using LLM compression.
   * Preserves the message structure but compresses text content.
   * Marks the message as compressed to avoid re-compression.
   * 
   * @async
   * @param {Object} message - The message to compress
   * @returns {Promise<Object>} Compressed message with same structure
   */
  async compressMessage(message) {
    if (!message || !message.content) return message;
    
    // Skip if already compressed
    if (message._compressed) return message;
    
    const compressedContent = [];
    
    if (Array.isArray(message.content)) {
      for (const block of message.content) {
        if (block.text) {
          // Compress text blocks
          const compressedText = await this.compressText(block.text);
          compressedContent.push({ text: compressedText });
        } else if (block.toolUse) {
          // Keep tool use blocks but compress input if it's large
          const toolUse = { ...block.toolUse };
          if (toolUse.input && JSON.stringify(toolUse.input).length > 500) {
            // For large tool inputs, just keep essential info
            toolUse.input = { _compressed: true, _summary: `Tool ${toolUse.name} was called` };
          }
          compressedContent.push({ toolUse });
        } else if (block.toolResult) {
          // Compress tool results - they can be very large
          const toolResult = { ...block.toolResult };
          const resultStr = JSON.stringify(block.toolResult.content);
          if (resultStr.length > 500) {
            // Compress large tool results to just status
            toolResult.content = [{ text: `[Result data compressed - ${block.toolResult.status || 'success'}]` }];
          }
          compressedContent.push({ toolResult });
        } else {
          // Keep other blocks as-is
          compressedContent.push(block);
        }
      }
    }
    
    return {
      role: message.role,
      content: compressedContent,
      _compressed: true  // Mark as compressed
    };
  }

  /**
   * Compresses older messages in the conversation history (moving window).
   * Keeps the last N messages uncompressed, compresses any older messages
   * that haven't been compressed yet.
   * 
   * @async
   * @param {number} keepRecent - Number of recent messages to keep uncompressed (default: 3)
   * @returns {Promise<boolean>} True if any compression was performed
   */
  async compressOlderMessages(keepRecent = 3) {
    // Need at least keepRecent + 1 messages to have something to compress
    if (this.messages.length <= keepRecent) {
      return false;
    }
    
    const splitIndex = this.messages.length - keepRecent;
    
    // Collect indices of messages that need compression
    const toCompress = [];
    for (let i = 0; i < splitIndex; i++) {
      if (!this.messages[i]._compressed) {
        toCompress.push(i + 1); // 1-based for display
      }
    }
    
    if (toCompress.length === 0) {
      return false;
    }
    
    // Show single line with all message numbers
    console.log(`\x1b[90m[Compressing messages: ${toCompress.join(' ')}]\x1b[0m`);
    
    // Compress each older message that isn't already compressed
    for (let i = 0; i < splitIndex; i++) {
      if (!this.messages[i]._compressed) {
        this.messages[i] = await this.compressMessage(this.messages[i]);
      }
    }
    
    return true;
  }

  /**
   * Creates a summary of older messages to reduce context size.
   * This is a LOCAL operation - does NOT call the LLM.
   * Aggressively truncates to ensure the summary is small.
   * 
   * @param {Array<Object>} messagesToSummarize - Messages to be summarized
   * @returns {Object} A summary message object
   */
  createSummaryMessage(messagesToSummarize) {
    const summaryParts = [];
    let currentExchange = [];
    
    for (const message of messagesToSummarize) {
      const text = this.extractMessageText(message);
      if (text) {
        // Take only first 100 chars of each message
        const brief = text.length > 100 ? text.substring(0, 100) + '...' : text;
        currentExchange.push(brief);
      }
      
      if (message.role === 'assistant' && currentExchange.length > 0) {
        // Combine and truncate to 200 chars per exchange
        const exchangeSummary = currentExchange.join(' -> ');
        const truncated = exchangeSummary.length > 200 
          ? exchangeSummary.substring(0, 200) + '...'
          : exchangeSummary;
        summaryParts.push(truncated);
        currentExchange = [];
      }
    }
    
    // Handle remaining
    if (currentExchange.length > 0) {
      const remaining = currentExchange.join(' -> ');
      summaryParts.push(remaining.length > 200 ? remaining.substring(0, 200) + '...' : remaining);
    }
    
    // Limit to last 5 exchanges max to keep summary small
    const limitedParts = summaryParts.slice(-5);
    
    const summaryText = `[PRIOR CONTEXT]\n` +
      limitedParts.map((part, i) => `${i + 1}. ${part}`).join('\n');
    
    return {
      role: 'user',
      content: [{ text: summaryText }]
    };
  }

  /**
   * Manages conversation history using moving window compression.
   * After every message, compresses any uncompressed messages older than the last 3.
   * 
   * @async
   * @returns {Promise<boolean>} True if compression was performed, false otherwise
   */
  async summarizeHistory() {
    // Emergency check: if we're over the limit, drop oldest messages
    if (this.needsEmergencyTruncation()) {
      console.log('\x1b[33m[Emergency: dropping old messages - context too large]\x1b[0m');
      if (this.messages.length > this.recentMessagesToPreserve) {
        this.messages = this.messages.slice(-this.recentMessagesToPreserve);
      }
      return true;
    }
    
    // Moving window: compress any uncompressed messages older than last 10
    const keepUncompressed = 10;
    
    try {
      return await this.compressOlderMessages(keepUncompressed);
    } catch (error) {
      console.log(`\x1b[33m[Compression failed: ${error.message}]\x1b[0m`);
      return false;
    }
  }

  /**
   * Processes @filename references in user input and replaces them with file contents.
   * Supports both relative paths (from current directory) and absolute paths.
   * 
   * @param {string} input - The user's input text potentially containing @filename references
   * @returns {string} The input with @filename references replaced by file contents
   */
  processFileReferences(input) {
    // Match @filepath patterns - supports paths with or without quotes
    // Matches: @filename, @./path/to/file, @/absolute/path, @"path with spaces"
    const fileRefPattern = /@(?:"([^"]+)"|'([^']+)'|(\S+))/g;
    
    let processedInput = input;
    let match;
    
    while ((match = fileRefPattern.exec(input)) !== null) {
      const fullMatch = match[0];
      // Get the filepath from whichever capture group matched
      const filepath = match[1] || match[2] || match[3];
      
      try {
        // Resolve the path - if it's not absolute, resolve from current working directory
        const resolvedPath = path.isAbsolute(filepath) 
          ? filepath 
          : path.resolve(process.cwd(), filepath);
        
        // Check if file exists
        if (fs.existsSync(resolvedPath)) {
          const fileContent = fs.readFileSync(resolvedPath, 'utf8');
          const fileName = path.basename(resolvedPath);
          
          // Replace the @reference with formatted file content
          const replacement = `\n--- Content of file: ${fileName} ---\n${fileContent}\n--- End of file: ${fileName} ---\n`;
          processedInput = processedInput.replace(fullMatch, replacement);
          
          console.log(`\x1b[90m[Loaded file: ${fileName}]\x1b[0m`);
        } else {
          console.log(`\x1b[33m[Warning: File not found: ${filepath}]\x1b[0m`);
        }
      } catch (error) {
        console.log(`\x1b[33m[Warning: Could not read file ${filepath}: ${error.message}]\x1b[0m`);
      }
    }
    
    return processedInput;
  }

  /**
   * Ends the chat session and performs cleanup.
   * 
   * @returns {void}
   */
  end() {
    // Close readline interface if it exists
    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }
    
    // Shutdown MCP client if initialized
    if (this.mcpClient) {
      this.mcpClient.shutdown();
      this.mcpClient = null;
    }
    
    // Clear conversation history
    this.messages = [];
    
    // Clear tool executor
    this.toolExecutor = null;
  }

  /**
   * Gets the combined tool configuration including built-in and MCP tools.
   * 
   * @returns {Object} Tool configuration for Bedrock API
   */
  getToolConfig() {
    // Start with built-in tools
    const combinedTools = [...toolConfig.tools];
    
    // Add MCP tools if available
    if (this.mcpClient && this.mcpEnabled) {
      const mcpToolSpecs = this.mcpClient.getToolSpecs();
      combinedTools.push(...mcpToolSpecs);
    }
    
    return { tools: combinedTools };
  }
}

module.exports = { ChatSession };