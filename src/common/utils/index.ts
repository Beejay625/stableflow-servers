export { MailService } from "./email";
export {
  otpEmailTemplate,
  welcomeEmailTemplate,
  passwordResetEmailTemplate,
} from "./email-templates";

// HTTP utilities
export {
  formatQueryParams,
  handleAxiosError,
  retryWithBackoff,
  RetryOptions,
  // Aliases for backward compatibility
  handleAxiosError as apiHandleAxiosError,
  handleAxiosError as httpHandleAxiosError,
  retryWithBackoff as httpRetryWithBackoff,
  retryWithBackoff as apiRetryWithBackoff,
} from "./http.util";

// String utilities
export { normalizeEmail, isValidEmail, truncateString } from "./string.util";

// Wallet configuration utility
export { WalletConfigService, WalletConfigData } from "./wallet-config";
