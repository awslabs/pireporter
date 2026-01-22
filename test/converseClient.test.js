/**
 * Unit tests for converseClient
 * @module test/converseClient.test
 */

'use strict';

const { converseWithTools, converseWithToolsStreaming, setDelayFunction, resetDelayFunction } = require('../converseClient');

describe('converseClient', () => {
  afterEach(() => resetDelayFunction());

  const sampleMessages = [{ role: 'user', content: [{ text: 'What is the CPU usage?' }] }];
  const sampleSystemPrompt = 'You are a database expert.';
  const sampleToolConfig = { tools: [] };
  const sampleModelId = 'anthropic.claude-3-sonnet-20240229-v1:0';

  describe('converseWithTools', () => {
    test('successfully calls Bedrock Converse API', async () => {
      const response = { output: { message: { content: [{ text: 'CPU is 50%' }] } }, stopReason: 'end_turn' };
      const mockClient = { send: jest.fn().mockResolvedValue(response) };
      
      const result = await converseWithTools(mockClient, sampleModelId, sampleMessages, sampleSystemPrompt, sampleToolConfig);
      expect(result).toEqual(response);
      expect(mockClient.send).toHaveBeenCalledTimes(1);
    });

    test('retries on ThrottlingException', async () => {
      setDelayFunction(() => Promise.resolve());
      const throttleErr = new Error('Rate exceeded');
      throttleErr.name = 'ThrottlingException';
      const response = { output: {}, stopReason: 'end_turn' };
      const mockClient = { send: jest.fn().mockRejectedValueOnce(throttleErr).mockRejectedValueOnce(throttleErr).mockResolvedValue(response) };
      
      const result = await converseWithTools(mockClient, sampleModelId, sampleMessages, sampleSystemPrompt, sampleToolConfig);
      expect(result).toEqual(response);
      expect(mockClient.send).toHaveBeenCalledTimes(3);
    });

    test('throws non-throttling errors immediately', async () => {
      const validationErr = new Error('Invalid model');
      validationErr.name = 'ValidationException';
      const mockClient = { send: jest.fn().mockRejectedValue(validationErr) };
      
      await expect(converseWithTools(mockClient, sampleModelId, sampleMessages, sampleSystemPrompt, sampleToolConfig)).rejects.toThrow('Invalid model');
      expect(mockClient.send).toHaveBeenCalledTimes(1);
    });
  });

  describe('converseWithToolsStreaming', () => {
    const createMockStream = (events) => ({
      [Symbol.asyncIterator]: async function* () { for (const e of events) yield e; }
    });

    test('streams text chunks', async () => {
      const events = [
        { contentBlockDelta: { delta: { text: 'Hello' } } },
        { contentBlockDelta: { delta: { text: ' world' } } },
        { contentBlockStop: {} },
        { messageStop: { stopReason: 'end_turn' } }
      ];
      const mockClient = { send: jest.fn().mockResolvedValue({ stream: createMockStream(events) }) };
      const chunks = [];
      
      const result = await converseWithToolsStreaming(mockClient, sampleModelId, sampleMessages, sampleSystemPrompt, sampleToolConfig, c => chunks.push(c));
      expect(chunks).toEqual(['Hello', ' world']);
      expect(result.output.message.content[0].text).toBe('Hello world');
    });

    test('handles tool use in streaming', async () => {
      const events = [
        { contentBlockStart: { start: { toolUse: { toolUseId: 'tool-1', name: 'get_metrics' } } } },
        { contentBlockDelta: { delta: { toolUse: { input: '{"cat":"cpu"}' } } } },
        { contentBlockStop: {} },
        { messageStop: { stopReason: 'tool_use' } }
      ];
      const mockClient = { send: jest.fn().mockResolvedValue({ stream: createMockStream(events) }) };
      
      const result = await converseWithToolsStreaming(mockClient, sampleModelId, sampleMessages, sampleSystemPrompt, sampleToolConfig, () => {});
      expect(result.stopReason).toBe('tool_use');
      expect(result.output.message.content[0].toolUse.name).toBe('get_metrics');
    });
  });
});
