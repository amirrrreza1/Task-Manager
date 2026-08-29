import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getSocketUrl } from '../lib/socket-url.ts';

describe('getSocketUrl', () => {
  it('returns NEXT_PUBLIC_SOCKET_URL if explicitly set', () => {
    const originalSocket = process.env.NEXT_PUBLIC_SOCKET_URL;
    process.env.NEXT_PUBLIC_SOCKET_URL = 'http://localhost:5000';
    try {
      assert.equal(getSocketUrl(), 'http://localhost:5000');
    } finally {
      process.env.NEXT_PUBLIC_SOCKET_URL = originalSocket;
    }
  });

  it('derives socket base URL from NEXT_PUBLIC_API_URL when SOCKET_URL not set', () => {
    const originalSocket = process.env.NEXT_PUBLIC_SOCKET_URL;
    const originalApi = process.env.NEXT_PUBLIC_API_URL;
    delete process.env.NEXT_PUBLIC_SOCKET_URL;
    process.env.NEXT_PUBLIC_API_URL = 'http://api.example.com:4000/api/v1';
    try {
      assert.equal(getSocketUrl(), 'http://api.example.com:4000');
    } finally {
      process.env.NEXT_PUBLIC_SOCKET_URL = originalSocket;
      process.env.NEXT_PUBLIC_API_URL = originalApi;
    }
  });

  it('falls back to localhost:4000 when no environment variables are set', () => {
    const originalSocket = process.env.NEXT_PUBLIC_SOCKET_URL;
    const originalApi = process.env.NEXT_PUBLIC_API_URL;
    delete process.env.NEXT_PUBLIC_SOCKET_URL;
    delete process.env.NEXT_PUBLIC_API_URL;
    try {
      assert.equal(getSocketUrl(), 'http://localhost:4000');
    } finally {
      process.env.NEXT_PUBLIC_SOCKET_URL = originalSocket;
      process.env.NEXT_PUBLIC_API_URL = originalApi;
    }
  });
});
