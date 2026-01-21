import { describe, expect, test } from 'bun:test'
import {
  ACP_METHODS,
  ACP_PROTOCOL_VERSION,
  DEFAULT_ACP_CLIENT_NAME,
  DEFAULT_ACP_TIMEOUT,
  DEFAULT_CALIBRATION_SAMPLE_SIZE,
  DEFAULT_HARNESS_TIMEOUT,
  DEFAULT_POLLING_INTERVAL,
  DEFAULT_TRIAL_COUNT,
  HEAD_LINES,
  JSON_RPC_ERRORS,
  MAX_CONTENT_LENGTH,
  TAIL_LINES,
} from '../constants.ts'

// ============================================================================
// ACP Protocol Constants
// ============================================================================

describe('ACP_METHODS', () => {
  test('contains all required lifecycle methods', () => {
    expect(ACP_METHODS.INITIALIZE).toBe('initialize')
    expect(ACP_METHODS.SHUTDOWN).toBe('shutdown')
  })

  test('contains all required session methods', () => {
    expect(ACP_METHODS.CREATE_SESSION).toBe('session/new')
    expect(ACP_METHODS.LOAD_SESSION).toBe('session/load')
    expect(ACP_METHODS.PROMPT).toBe('session/prompt')
    expect(ACP_METHODS.CANCEL).toBe('session/cancel')
    expect(ACP_METHODS.UPDATE).toBe('session/update')
    expect(ACP_METHODS.REQUEST_PERMISSION).toBe('session/request_permission')
    expect(ACP_METHODS.SET_MODEL).toBe('session/set_model')
  })

  test('contains protocol-level methods', () => {
    expect(ACP_METHODS.CANCEL_REQUEST).toBe('$/cancel_request')
  })
})

describe('ACP_PROTOCOL_VERSION', () => {
  test('is version 1', () => {
    expect(ACP_PROTOCOL_VERSION).toBe(1)
  })
})

// ============================================================================
// JSON-RPC Error Codes
// ============================================================================

describe('JSON_RPC_ERRORS', () => {
  test('contains standard JSON-RPC error codes', () => {
    expect(JSON_RPC_ERRORS.PARSE_ERROR).toBe(-32700)
    expect(JSON_RPC_ERRORS.INVALID_REQUEST).toBe(-32600)
    expect(JSON_RPC_ERRORS.METHOD_NOT_FOUND).toBe(-32601)
    expect(JSON_RPC_ERRORS.INVALID_PARAMS).toBe(-32602)
    expect(JSON_RPC_ERRORS.INTERNAL_ERROR).toBe(-32603)
  })

  test('contains ACP extension error codes', () => {
    expect(JSON_RPC_ERRORS.REQUEST_CANCELLED).toBe(-32800)
  })
})

// ============================================================================
// ACP Client Defaults
// ============================================================================

describe('ACP Client defaults', () => {
  test('DEFAULT_ACP_CLIENT_NAME is set', () => {
    expect(DEFAULT_ACP_CLIENT_NAME).toBe('plaited-acp-client')
  })

  test('DEFAULT_ACP_TIMEOUT is 30 seconds', () => {
    expect(DEFAULT_ACP_TIMEOUT).toBe(30000)
  })

  test('DEFAULT_POLLING_INTERVAL is 50ms', () => {
    expect(DEFAULT_POLLING_INTERVAL).toBe(50)
  })
})

// ============================================================================
// Harness Preview Configuration
// ============================================================================

describe('Preview configuration', () => {
  test('HEAD_LINES is positive', () => {
    expect(HEAD_LINES).toBeGreaterThan(0)
    expect(HEAD_LINES).toBe(8)
  })

  test('TAIL_LINES is positive', () => {
    expect(TAIL_LINES).toBeGreaterThan(0)
    expect(TAIL_LINES).toBe(4)
  })

  test('MAX_CONTENT_LENGTH is reasonable', () => {
    expect(MAX_CONTENT_LENGTH).toBeGreaterThan(0)
    expect(MAX_CONTENT_LENGTH).toBe(500)
  })
})

// ============================================================================
// Harness Defaults
// ============================================================================

describe('Harness defaults', () => {
  test('DEFAULT_HARNESS_TIMEOUT is 60 seconds', () => {
    expect(DEFAULT_HARNESS_TIMEOUT).toBe(60000)
  })

  test('DEFAULT_TRIAL_COUNT is 5', () => {
    expect(DEFAULT_TRIAL_COUNT).toBe(5)
  })

  test('DEFAULT_CALIBRATION_SAMPLE_SIZE is 10', () => {
    expect(DEFAULT_CALIBRATION_SAMPLE_SIZE).toBe(10)
  })
})
