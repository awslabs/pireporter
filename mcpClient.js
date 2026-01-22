/**
 * MCP (Model Context Protocol) Client for pireporter
 * 
 * Handles communication with MCP servers to provide external tools
 * like database queries and AWS documentation access to the LLM.
 * 
 * @module mcpClient
 */

'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

/**
 * MCP Client class manages connections to MCP servers and tool execution.
 */
class MCPClient {
  constructor() {
    this.servers = new Map(); // Map of server name -> server process info
    this.tools = new Map();   // Map of tool name -> { server, toolSpec }
    this.initialized = false;
  }

  /**
   * Initialize MCP client by loading config and starting enabled servers.
   * 
   * @async
   * @returns {Promise<void>}
   */
  async initialize() {
    // Load MCP configuration
    const mcpConfigPath = path.join(process.cwd(), 'mcp.json');
    if (!fs.existsSync(mcpConfigPath)) {
      console.log('\x1b[90m[MCP: No mcp.json config found, skipping MCP initialization]\x1b[0m');
      return;
    }

    let mcpConfig;
    try {
      mcpConfig = JSON.parse(fs.readFileSync(mcpConfigPath, 'utf8'));
    } catch (error) {
      console.error(`\x1b[33m[MCP: Error reading mcp.json: ${error.message}]\x1b[0m`);
      return;
    }

    if (!mcpConfig.mcpServers) {
      return;
    }

    // Start each enabled server
    for (const [serverName, serverConfig] of Object.entries(mcpConfig.mcpServers)) {
      if (serverConfig.enabled === false) {
        continue;
      }

      try {
        await this.startServer(serverName, serverConfig);
      } catch (error) {
        console.error(`\x1b[33m[MCP: Failed to start ${serverName}: ${error.message}]\x1b[0m`);
      }
    }

    this.initialized = true;
  }

  /**
   * Start an MCP server process and discover its tools.
   * 
   * @async
   * @param {string} serverName - Name of the server
   * @param {Object} serverConfig - Server configuration
   * @returns {Promise<void>}
   */
  async startServer(serverName, serverConfig) {
    const { command, args = [], env = {} } = serverConfig;

    // Merge environment variables
    const processEnv = { ...process.env, ...env };

    // Spawn the MCP server process
    const serverProcess = spawn(command, args, {
      env: processEnv,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    // Set up JSON-RPC communication
    const serverInfo = {
      process: serverProcess,
      name: serverName,
      config: serverConfig,
      requestId: 0,
      pendingRequests: new Map(),
      tools: []
    };

    // Handle stdout (JSON-RPC responses)
    let buffer = '';
    serverProcess.stdout.on('data', (data) => {
      buffer += data.toString();
      
      // Try to parse complete JSON-RPC messages
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer
      
      for (const line of lines) {
        if (line.trim()) {
          try {
            const message = JSON.parse(line);
            this.handleServerMessage(serverName, message);
          } catch (e) {
            // Not valid JSON, ignore
          }
        }
      }
    });

    // Handle stderr (errors/logs)
    serverProcess.stderr.on('data', (data) => {
      // Log MCP server errors in debug mode
      // console.error(`[MCP ${serverName}]: ${data.toString()}`);
    });

    // Handle process exit
    serverProcess.on('exit', (code) => {
      console.log(`\x1b[90m[MCP: ${serverName} exited with code ${code}]\x1b[0m`);
      this.servers.delete(serverName);
    });

    this.servers.set(serverName, serverInfo);

    // Initialize the server with JSON-RPC
    await this.sendRequest(serverName, 'initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: {
        name: 'pireporter',
        version: '1.0.0'
      }
    });

    // Send initialized notification
    this.sendNotification(serverName, 'notifications/initialized', {});

    // Discover available tools
    const toolsResponse = await this.sendRequest(serverName, 'tools/list', {});
    if (toolsResponse && toolsResponse.tools) {
      serverInfo.tools = toolsResponse.tools;
      
      // Register tools with their server
      for (const tool of toolsResponse.tools) {
        this.tools.set(tool.name, {
          server: serverName,
          toolSpec: tool
        });
      }
      
      console.log(`\x1b[90m[MCP: ${serverName} loaded with ${toolsResponse.tools.length} tools]\x1b[0m`);
    }
  }

  /**
   * Send a JSON-RPC request to an MCP server.
   * 
   * @async
   * @param {string} serverName - Name of the server
   * @param {string} method - RPC method name
   * @param {Object} params - Method parameters
   * @returns {Promise<Object>} Response result
   */
  async sendRequest(serverName, method, params) {
    const serverInfo = this.servers.get(serverName);
    if (!serverInfo) {
      throw new Error(`Server ${serverName} not found`);
    }

    const requestId = ++serverInfo.requestId;
    const request = {
      jsonrpc: '2.0',
      id: requestId,
      method,
      params
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        serverInfo.pendingRequests.delete(requestId);
        reject(new Error(`Request timeout for ${method}`));
      }, 30000);

      serverInfo.pendingRequests.set(requestId, { resolve, reject, timeout });
      serverInfo.process.stdin.write(JSON.stringify(request) + '\n');
    });
  }

  /**
   * Send a JSON-RPC notification to an MCP server (no response expected).
   * 
   * @param {string} serverName - Name of the server
   * @param {string} method - RPC method name
   * @param {Object} params - Method parameters
   */
  sendNotification(serverName, method, params) {
    const serverInfo = this.servers.get(serverName);
    if (!serverInfo) return;

    const notification = {
      jsonrpc: '2.0',
      method,
      params
    };

    serverInfo.process.stdin.write(JSON.stringify(notification) + '\n');
  }

  /**
   * Handle incoming message from MCP server.
   * 
   * @param {string} serverName - Name of the server
   * @param {Object} message - JSON-RPC message
   */
  handleServerMessage(serverName, message) {
    const serverInfo = this.servers.get(serverName);
    if (!serverInfo) return;

    // Handle response to a request
    if (message.id !== undefined) {
      const pending = serverInfo.pendingRequests.get(message.id);
      if (pending) {
        clearTimeout(pending.timeout);
        serverInfo.pendingRequests.delete(message.id);
        
        if (message.error) {
          pending.reject(new Error(message.error.message || 'Unknown error'));
        } else {
          pending.resolve(message.result);
        }
      }
    }
  }

  /**
   * Execute an MCP tool.
   * 
   * @async
   * @param {string} toolName - Name of the tool to execute
   * @param {Object} args - Tool arguments
   * @returns {Promise<Object>} Tool execution result
   */
  async executeTool(toolName, args) {
    const toolInfo = this.tools.get(toolName);
    if (!toolInfo) {
      return { error: `MCP tool '${toolName}' not found` };
    }

    try {
      const result = await this.sendRequest(toolInfo.server, 'tools/call', {
        name: toolName,
        arguments: args
      });
      return result;
    } catch (error) {
      return { error: `MCP tool execution failed: ${error.message}` };
    }
  }

  /**
   * Get all available MCP tools in Bedrock toolSpec format.
   * 
   * @returns {Array<Object>} Array of tool specifications
   */
  getToolSpecs() {
    const specs = [];
    
    for (const [toolName, toolInfo] of this.tools) {
      const mcpTool = toolInfo.toolSpec;
      
      // Convert MCP tool schema to Bedrock toolSpec format
      specs.push({
        toolSpec: {
          name: toolName,
          description: mcpTool.description || `MCP tool: ${toolName}`,
          inputSchema: {
            json: mcpTool.inputSchema || { type: 'object', properties: {} }
          }
        }
      });
    }
    
    return specs;
  }

  /**
   * Check if a tool is an MCP tool.
   * 
   * @param {string} toolName - Name of the tool
   * @returns {boolean} True if it's an MCP tool
   */
  isMCPTool(toolName) {
    return this.tools.has(toolName);
  }

  /**
   * Shutdown all MCP servers.
   */
  shutdown() {
    for (const [serverName, serverInfo] of this.servers) {
      try {
        serverInfo.process.kill();
      } catch (e) {
        // Ignore errors during shutdown
      }
    }
    this.servers.clear();
    this.tools.clear();
  }
}

module.exports = { MCPClient };
