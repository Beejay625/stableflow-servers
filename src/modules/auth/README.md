# Auth Module - Tests and Usage

## DeleteUserAndData Endpoint

This endpoint is for testing purposes only and should not be used in production environments. It deletes a user and all associated data, including:
- User record
- All businesses owned by the user
- Wallet data associated with the user and businesses

### Endpoint Details
- **URL**: `/auth/test/delete-user/:userId`
- **Method**: DELETE
- **Authentication**: None (public endpoint for testing)

### Example Usage with cURL

```bash
# Replace USER_ID with the actual user ID
curl -X DELETE http://localhost:3000/auth/test/delete-user/USER_ID
```

### Expected Response

```json
{
  "success": true,
  "deletedBusinessesCount": 2,
  "message": "User USER_ID and 2 associated businesses have been deleted"
}
```

### Error Responses

**User Not Found (404)**
```json
{
  "statusCode": 404,
  "message": "User with ID USER_ID not found",
  "error": "Not Found"
}
```

**Server Error (500)**
```json
{
  "statusCode": 500,
  "message": "Internal server error",
  "error": "Internal Server Error"
}
```

## Running Tests

```bash
# Run all auth module tests
npm run test:auth

# Run just the delete-user test file
npm test -- ./src/modules/auth/__tests__/delete-user.test.ts
``` 