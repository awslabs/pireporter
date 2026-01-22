# MCP Support for pireporter Chat Mode

## Overview
Add Model Context Protocol (MCP) support to enable the LLM to access external tools like database querying and AWS documentation during chat sessions.

## User Stories

### US-1: Enable/Disable MCP Tools
As a user, I want to enable or disable MCP tools via configuration so that I can use pireporter in environments without internet access.

**Acceptance Criteria:**
- conf.json has `mcpEnabled` parameter (default: false)
- When disabled, chat mode works with only built-in snapshot query tools
- When enabled, MCP tools are loaded and available to the LLM

### US-2: MCP Tools Configuration
As a user, I want to configure which MCP servers to use so that I can customize the available external tools.

**Acceptance Criteria:**
- New `mcp.json` config file for MCP server definitions
- Support for stdio-based MCP servers
- Each server can be individually enabled/disabled

### US-3: Database Query Tool
As a user, I want the LLM to be able to query my database directly so that it can investigate issues beyond what's in the snapshot.

**Acceptance Criteria:**
- MCP server for PostgreSQL database queries
- Connection details configurable in mcp.json
- Read-only queries only for safety

### US-4: AWS Documentation Tool  
As a user, I want the LLM to access AWS documentation so that it can provide accurate recommendations based on latest AWS best practices.

**Acceptance Criteria:**
- Integration with AWS documentation MCP server
- LLM can search and retrieve relevant AWS docs
