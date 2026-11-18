import { test as base, expect } from './standard.fixture.ts';
import { request } from '@playwright/test';
import { commonFixtureExtensions } from './common-fixture-extensions.js';

export const test = base.extend(commonFixtureExtensions);

export { expect, request };
