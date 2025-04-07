export { MailService } from './email';
export { 
  otpEmailTemplate,
  welcomeEmailTemplate,
  passwordResetEmailTemplate
} from './email-templates';

// Api utilities
export { 
  handleAxiosError as apiHandleAxiosError,
  retryWithBackoff as apiRetryWithBackoff 
} from './api-utils';

// HTTP utilities
export { 
  formatQueryParams,
  handleAxiosError as httpHandleAxiosError,
  retryWithBackoff as httpRetryWithBackoff 
} from './http.util';

// String utilities
export {
  normalizeEmail,
  isValidEmail,
  truncateString
} from './string.util';

// Wallet configuration utility
export { WalletConfigService, WalletConfigData } from './wallet-config'; 