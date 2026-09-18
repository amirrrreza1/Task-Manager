import { SetMetadata } from '@nestjs/common';

export const DEMO_WRITABLE_KEY = 'demoWritable';
export const DEMO_RESTRICTED_KEY = 'demoRestricted';

/** Allow a restricted demo account to call state-changing handlers in this scope. */
export const DemoWritable = () => SetMetadata(DEMO_WRITABLE_KEY, true);

/** Deny a restricted demo account even when the handler is read-only (for file downloads). */
export const DemoRestricted = () => SetMetadata(DEMO_RESTRICTED_KEY, true);
