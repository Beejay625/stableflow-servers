export interface NubapiResponse {
  status: string;
  message: string;
  data?: {
    account_name?: string;
    account_number?: string;
    bank_code?: string;
  };
  account_name?: string;
} 