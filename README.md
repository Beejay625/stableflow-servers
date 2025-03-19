# StableFlow API

## Public API Endpoints

The following endpoints are publicly accessible without authentication:

### Currencies and Financial Institutions

- **GET /api/v1/public/businesses/currencies**
  - Returns a list of all supported currencies
  - No authentication required

## Authenticated API Endpoints

The following endpoints require authentication:

### Banking and Exchange Rates

- **GET /api/v1/businesses/banks**
  - Returns a list of Nigerian banks
  - Authentication required

- **GET /api/v1/businesses/v1/rates/{token}/{amount}/{fiat}**
  - Returns the exchange rate for a specific amount of token (cryptocurrency) to a fiat currency
  - Authentication required
  - Path parameters:
    - `token`: Cryptocurrency token (e.g., "USDT", "USDC")
    - `amount`: Amount to convert
    - `fiat`: Fiat currency code (e.g., "NGN", "USD")
  - Query parameters:
    - `providerId`: Provider ID (optional)
  - Example: `/api/v1/businesses/v1/rates/USDT/100/NGN`

## Development

### Environment Setup

1. Copy `.env.example` to `.env.development` for local development
2. Update the database connection details in `.env.development`
3. Install dependencies: `npm install`
4. Run migrations: `npm run migration:run`
5. Start the development server: `npm run start:dev`

### API Documentation

API documentation is available at `/api/v1/docs` when the server is running. 