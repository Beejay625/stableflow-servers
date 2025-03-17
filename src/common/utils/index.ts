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