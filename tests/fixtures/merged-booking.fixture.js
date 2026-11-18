import { test as base, expect } from './fixtures.ts';
import { request } from '@playwright/test';
import { commonFixtureExtensions } from './common-fixture-extensions.js';

/**
 * Dedicated fixture for merged booking tests.
 * Uses the persistent Chrome profile with stored authentication and Cloudflare bypass.
 */
export const test = base.extend(commonFixtureExtensions);

export { expect, request };
