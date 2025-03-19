# Nigerian Banks API

## Overview

We've added a new endpoint to fetch Nigerian banks directly from NubaAPI. This endpoint is specifically for the Nigerian market and returns a comprehensive list of all Nigerian banks with their codes.

## Endpoint

```
GET /api/v1/public/businesses/banks
```

## Response

```json
{
  "statusCode": 200,
  "message": "Success",
  "data": [
    {
      "name": "ACCESS BANK",
      "code": "044"
    },
    {
      "name": "CITIBANK",
      "code": "023"
    },
    ...
  ]
}
```

## Implementation Details

1. Added a new endpoint in the `PublicBusinessController` to handle the `/banks` route
2. Created a dedicated method in the `BusinessService` to fetch data from NubaAPI
3. Defined interfaces for the Nigerian bank data structures

## Related Changes

- Updated the `getSupportedInstitutions` method to maintain compatibility with the existing API while focusing on Nigerian banks
- Added proper typing to ensure type safety when working with bank data

## Next Steps

- Consider caching bank data to improve performance and reduce dependency on the external API
- Add feature flag to toggle between fetching banks from Paycrest vs. NubaAPI 