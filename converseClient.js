/**
 * Bedrock Converse API Client
 * 
 * Provides a wrapper for the Bedrock Converse API with tool use support.
 * Handles throttling with exponential backoff retry logic.
 * Supports both streaming and non-streaming responses.
 * 
 * @module converseClient
 */

'use strict';

const { ConverseCommand, ConverseStreamCommand } = require("@aws-sdk/client-bedrock-runtime");

/**
 * Delay helper function for implementing backoff
 * @param {number} ms - Milliseconds to delay
 * @returns {Promise<void>}
 */
let delayFn = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Set a custom delay function (for testing)
 * @param {Function} fn - Custom delay function
 */
function setDelayFunction(fn) {
  delayFn = fn;
}

/**
 * Reset delay function to default
 */
function resetDelayFunction() {
  delayFn = ms => new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Sends a conversation request to Bedrock using the Converse API with tool support.
 * Implements exponential backoff retry logic for throttling exceptions.
 * 
 * @async
 * @param {BedrockRuntimeClient} client - The Bedrock runtime client instance
 * @param {string} modelId - The model ID to use (e.g., 'anthropic.claude-3-sonnet-20240229-v1:0')
 * @param {Array<Object>} messages - Array of conversation messages in Bedrock format
 * @param {string} systemPrompt - System prompt to guide the model's behavior
 * @param {Object} toolConfig - Tool configuration object containing tool definitions
 * @returns {Promise<Object>} The Converse API response
 * @throws {Error} Throws non-throttling errors after logging metadata
 * 
 * @example
 * const response = await converseWithTools(
 *   client,
 *   'anthropic.claude-3-sonnet-20240229-v1:0',
 *   [{ role: 'user', content: [{ text: 'What is the CPU usage?' }] }],
 *   'You are a database performance expert.',
 *   { tools: [...] }
 * );
 */
async function converseWithTools(client, modelId, messages, systemPrompt, toolConfig) {
  const input = {
    modelId: modelId,
    messages: messages,
    system: [{ text: systemPrompt }],
    toolConfig: toolConfig,
    inferenceConfig: {
      maxTokens: 4096,
      temperature: 0.1
    }
  };

  const command = new ConverseCommand(input);
  
  // Exponential backoff configuration
  const initialDelayMs = 5000;
  const maxRetries = 5;
  let retryCount = 0;
  
  while (true) {
    try {
      const response = await client.send(command);
      return response;
    } catch (error) {
      if (error.name === 'ThrottlingException') {
        retryCount++;
        if (retryCount > maxRetries) {
          console.error('Max retries exceeded for throttling');
          throw error;
        }
        // Exponential backoff: 5s, 10s, 20s, 40s, 80s
        const backoffDelay = initialDelayMs * Math.pow(2, retryCount - 1);
        await delayFn(backoffDelay);
        continue;
      }
      // For non-throttling errors, log metadata and throw
      if (error.$metadata) {
        const { requestId, cfId, extendedRequestId } = error.$metadata;
        console.error('Bedrock Converse API error:', error.message, { requestId, cfId, extendedRequestId });
      }
      throw error;
    }
  }
}

/**
 * Sends a streaming conversation request to Bedrock using the ConverseStream API.
 * Streams response tokens as they are generated, providing real-time output.
 * Implements exponential backoff retry logic for throttling exceptions.
 * 
 * @async
 * @param {BedrockRuntimeClient} client - The Bedrock runtime client instance
 * @param {string} modelId - The model ID to use (e.g., 'anthropic.claude-3-sonnet-20240229-v1:0')
 * @param {Array<Object>} messages - Array of conversation messages in Bedrock format
 * @param {string} systemPrompt - System prompt to guide the model's behavior
 * @param {Object} toolConfig - Tool configuration object containing tool definitions
 * @param {Function} onTextChunk - Callback function called with each text chunk as it arrives
 * @returns {Promise<Object>} The complete response object with stopReason and full message
 * @throws {Error} Throws non-throttling errors after logging metadata
 * 
 * @example
 * const response = await converseWithToolsStreaming(
 *   client,
 *   'anthropic.claude-3-sonnet-20240229-v1:0',
 *   [{ role: 'user', content: [{ text: 'What is the CPU usage?' }] }],
 *   'You are a database performance expert.',
 *   { tools: [...] },
 *   (chunk) => process.stdout.write(chunk)
 * );
 */
async function converseWithToolsStreaming(client, modelId, messages, systemPrompt, toolConfig, onTextChunk) {
  const input = {
    modelId: modelId,
    messages: messages,
    system: [{ text: systemPrompt }],
    toolConfig: toolConfig,
    inferenceConfig: {
      maxTokens: 4096,
      temperature: 0.1
    }
  };

  const command = new ConverseStreamCommand(input);
  
  // Exponential backoff configuration
  const initialDelayMs = 5000;
  const maxRetries = 5;
  let retryCount = 0;
  
  while (true) {
    try {
      const response = await client.send(command);
      
      // Process the stream
      let stopReason = null;
      let fullText = '';
      let usage = null;
      const contentBlocks = [];
      let currentToolUse = null;
      let currentToolUseInput = '';
      
      for await (const event of response.stream) {
        // Handle different event types
        if (event.contentBlockStart) {
          const start = event.contentBlockStart.start;
          if (start?.toolUse) {
            // Starting a tool use block
            currentToolUse = {
              toolUseId: start.toolUse.toolUseId,
              name: start.toolUse.name,
              input: {}
            };
            currentToolUseInput = '';
          }
        } else if (event.contentBlockDelta) {
          const delta = event.contentBlockDelta.delta;
          if (delta?.text) {
            // Text chunk - stream it to the callback
            fullText += delta.text;
            if (onTextChunk) {
              onTextChunk(delta.text);
            }
          } else if (delta?.toolUse) {
            // Tool use input chunk
            currentToolUseInput += delta.toolUse.input || '';
          }
        } else if (event.contentBlockStop) {
          // Content block finished
          if (currentToolUse) {
            // Parse the accumulated tool input JSON
            try {
              currentToolUse.input = currentToolUseInput ? JSON.parse(currentToolUseInput) : {};
            } catch (e) {
              currentToolUse.input = {};
            }
            contentBlocks.push({ toolUse: currentToolUse });
            currentToolUse = null;
            currentToolUseInput = '';
          } else if (fullText) {
            // Only add text block if we have accumulated text
            // Note: We'll add it at the end to avoid duplicates
          }
        } else if (event.messageStop) {
          stopReason = event.messageStop.stopReason;
        } else if (event.metadata) {
          // Capture usage information
          if (event.metadata.usage) {
            usage = event.metadata.usage;
          }
        }
      }
      
      // Build the final content array
      const finalContent = [];
      if (fullText) {
        finalContent.push({ text: fullText });
      }
      finalContent.push(...contentBlocks);
      
      // Return a response object compatible with non-streaming format
      return {
        stopReason: stopReason,
        output: {
          message: {
            role: 'assistant',
            content: finalContent
          }
        },
        usage: usage || { inputTokens: 0, outputTokens: 0 }
      };
      
    } catch (error) {
      if (error.name === 'ThrottlingException') {
        retryCount++;
        if (retryCount > maxRetries) {
          console.error('Max retries exceeded for throttling');
          throw error;
        }
        // Exponential backoff: 5s, 10s, 20s, 40s, 80s
        const backoffDelay = initialDelayMs * Math.pow(2, retryCount - 1);
        await delayFn(backoffDelay);
        continue;
      }
      // For non-throttling errors, log metadata and throw
      if (error.$metadata) {
        const { requestId, cfId, extendedRequestId } = error.$metadata;
        console.error('Bedrock Converse Stream API error:', error.message, { requestId, cfId, extendedRequestId });
      }
      throw error;
    }
  }
}

module.exports = { converseWithTools, converseWithToolsStreaming, setDelayFunction, resetDelayFunction };
