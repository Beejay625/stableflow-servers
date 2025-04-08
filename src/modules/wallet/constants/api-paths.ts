/**
 * API paths for various endpoints
 */
export const API_PATHS = {
  BLOCKRADAR: {
    BASE: "https://api.blockradar.co/v1",
    ADDRESSES: (walletId: string) => `wallets/${walletId}/addresses`,
    BALANCES: (walletId: string, addressId: string) => 
      `wallets/${walletId}/addresses/${addressId}/balances`,
    WEBHOOK_RESEND: (walletId: string) => 
      `wallets/${walletId}/transactions/webhooks/resend`,
  }
}; 