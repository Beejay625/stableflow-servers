/**
 * Wallet Module Test Integration
 * 
 * This file serves as an integration point for all wallet module tests.
 * When you run tests targeting this file, it will trigger all tests in the module.
 * 
 * Example: npm run test -- src/modules/wallet/test
 */

// Import all unit tests
import './unit/blockradar-api.service.spec';
// Add other unit tests as they are created
// import './unit/wallet.service.spec';
// import './unit/wallet.controller.spec';

// Run e2e tests separately with:
// npm run test:e2e -- src/modules/wallet/test/e2e 