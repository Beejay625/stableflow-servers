export interface Institution {
  name: string;
  code: string;
  type: 'bank' | 'mobile_money';
}

export interface Currency {
  code: string;
  name: string;
  shortName: string;
  decimals: number;
  symbol: string;
  marketRate: string;
}

export interface VerifyAccountRequest {
  institution: string;
  accountIdentifier: string;
}

export interface PaycrestResponse<T> {
  message: string;
  status: 'success' | 'error';
  data: T;
}

// Removed OfframpRequest, OfframpResponse, and WebhookResponse interfaces
// as they were only used by the offramp module which has been removed. 