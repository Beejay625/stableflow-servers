export interface ApiResponse<T> {
  status: "success" | "error";
  message: string;
  data: T;
}

export interface PublicKeyResponse extends ApiResponse<string> {}

export interface OrderStatusResponse
  extends ApiResponse<{
    orderId: string;
    status: string;
    createdAt: string;
    completedAt?: string;
  }> {}

export interface OrderCreateResponse
  extends ApiResponse<{
    txHash: string;
  }> {}
