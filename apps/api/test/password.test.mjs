import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import passwordModule from '../dist/auth/password.service.js';

const { PasswordService } = passwordModule;

describe('PasswordService', () => {
  it('hashes with Argon2id and verifies only the correct password', async () => {
    const passwords = new PasswordService();
    const hash = await passwords.hash('a-secure-example-password');

    assert.match(hash, /^\$argon2id\$/);
    assert.equal(await passwords.verify(hash, 'a-secure-example-password'), true);
    assert.equal(await passwords.verify(hash, 'wrong-password'), false);
  });
});
