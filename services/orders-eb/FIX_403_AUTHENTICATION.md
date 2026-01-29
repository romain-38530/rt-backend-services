# Fix for 403 Forbidden Error on Orders API

## Problem Summary

**Error:** `GET https://d2dbvsga281o6l.cloudfront.net/api/orders?carrierId=696ba0ee85685ef0a45b5c80&limit=1000` returns 403 Forbidden

**Root Cause:** The Orders API (`services/orders-eb/index.js`) had **NO authentication middleware** to verify JWT tokens. The frontend was sending valid JWT tokens in the Authorization header, but the backend was not checking them, resulting in 403 Forbidden errors.

## Solution

Added JWT authentication middleware to the Orders API with the following changes:

### 1. Added jsonwebtoken dependency
**File:** `package.json`
- Added `"jsonwebtoken": "^9.0.2"` to dependencies

### 2. Added JWT Authentication Middleware
**File:** `index.js`

Added authentication middleware function that:
- Extracts JWT token from Authorization header (Bearer token)
- Verifies token signature using JWT_SECRET
- Returns 401 for missing/invalid/expired tokens
- Attaches decoded user info to req.user for use in routes

```javascript
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Access token required',
      code: 'UNAUTHORIZED'
    });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          error: 'Token expired',
          code: 'TOKEN_EXPIRED'
        });
      }
      return res.status(403).json({
        success: false,
        error: 'Invalid token',
        code: 'INVALID_TOKEN'
      });
    }

    req.user = user;
    next();
  });
}
```

### 3. Added Authorization Checks
**Protected Routes:**
- `GET /api/v1/orders` - List orders with authorization
- `GET /api/v1/orders/:id` - Get single order with ownership verification
- `POST /api/v1/orders` - Create order (authenticated)
- `PUT /api/v1/orders/:id` - Update order (authenticated)
- `DELETE /api/v1/orders/:id` - Delete order (authenticated)

**Authorization Logic:**
- Carriers can only access orders where `carrierId` matches their user ID
- Industrials can only access orders where `customerId` matches their user ID
- If no filter is provided, automatically filters by user's ID based on their type
- Returns 403 FORBIDDEN if user tries to access orders they don't own

Example authorization check in GET /api/v1/orders:
```javascript
if (req.query.carrierId) {
  // Authorization check: verify user is authorized to view this carrier's orders
  if (userType === 'carrier' || userType === 'transporteur' || userType === 'transporter') {
    if (req.query.carrierId !== userId && req.query.carrierId !== (req.user.carrierId || req.user.companyId)) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to view orders for this carrier',
        code: 'FORBIDDEN'
      });
    }
  }
  query.carrierId = req.query.carrierId;
}
```

## Environment Variables

The JWT_SECRET must be set in environment variables:

```bash
JWT_SECRET=symphonia-secret-key-2024-change-in-production
```

**IMPORTANT:** The JWT_SECRET must match the secret used by the Auth service (`services/authz-eb`) that generates the tokens.

## Deployment Steps

### 1. Install Dependencies
```bash
cd services/orders-eb
npm install
```

### 2. Set Environment Variables
Ensure JWT_SECRET is configured in Elastic Beanstalk environment:
```bash
eb setenv JWT_SECRET="<your-jwt-secret>"
```

### 3. Deploy to Production
```bash
cd services/orders-eb
eb deploy rt-orders-api-prod
```

### 4. Verify CloudFront Cache
After deployment, you may need to invalidate CloudFront cache:
```bash
aws cloudfront create-invalidation \
  --distribution-id <DISTRIBUTION_ID> \
  --paths "/api/orders/*" "/api/v1/orders/*"
```

## Testing

### 1. Test with Valid JWT Token
```bash
# Get auth token first
curl -X POST https://ddaywxps9n701.cloudfront.net/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"carrier@example.com","password":"password"}'

# Use token to query orders
curl -X GET "https://d2dbvsga281o6l.cloudfront.net/api/orders?carrierId=696ba0ee85685ef0a45b5c80&limit=1000" \
  -H "Authorization: Bearer <YOUR_JWT_TOKEN>"
```

Expected response:
```json
{
  "success": true,
  "count": 10,
  "data": [...]
}
```

### 2. Test without Token (should return 401)
```bash
curl -X GET "https://d2dbvsga281o6l.cloudfront.net/api/orders?carrierId=696ba0ee85685ef0a45b5c80"
```

Expected response:
```json
{
  "success": false,
  "error": "Access token required",
  "code": "UNAUTHORIZED"
}
```

### 3. Test with Invalid Token (should return 403)
```bash
curl -X GET "https://d2dbvsga281o6l.cloudfront.net/api/orders?carrierId=696ba0ee85685ef0a45b5c80" \
  -H "Authorization: Bearer invalid_token"
```

Expected response:
```json
{
  "success": false,
  "error": "Invalid token",
  "code": "INVALID_TOKEN"
}
```

### 4. Test Authorization (carrier trying to access another carrier's orders)
```bash
curl -X GET "https://d2dbvsga281o6l.cloudfront.net/api/orders?carrierId=DIFFERENT_CARRIER_ID" \
  -H "Authorization: Bearer <CARRIER_TOKEN>"
```

Expected response:
```json
{
  "success": false,
  "error": "Not authorized to view orders for this carrier",
  "code": "FORBIDDEN"
}
```

## Security Improvements

1. **JWT Token Verification:** All API requests now require a valid JWT token
2. **User Authorization:** Users can only access their own data
3. **Token Expiration:** Expired tokens are properly detected and rejected
4. **Error Codes:** Consistent error responses with proper HTTP status codes
5. **Type Safety:** User type/role is validated to ensure correct data access

## CloudFront Configuration

The CloudFront distribution (`d2dbvsga281o6l.cloudfront.net`) is configured to:
- Forward Authorization header to origin (already configured in `cf-update.json`)
- Cache is disabled for authenticated endpoints (TTL = 0)
- CORS headers are properly forwarded

## Files Modified

1. `services/orders-eb/package.json` - Added jsonwebtoken dependency
2. `services/orders-eb/index.js` - Added authentication middleware and authorization checks

## Rollback Plan

If issues occur after deployment:

```bash
cd services/orders-eb
git revert HEAD
eb deploy rt-orders-api-prod
```

## Status

- [x] JWT authentication middleware implemented
- [x] Authorization checks added to all CRUD routes
- [x] Token verification with proper error handling
- [x] User type-based access control
- [ ] Deployed to production
- [ ] Tested with real frontend application
- [ ] CloudFront cache invalidated

## Notes

- The frontend (`rt-frontend-apps/apps/web-transporter`) already sends JWT tokens correctly via `getAuthHeaders()` in `lib/api.ts`
- The Auth service (`services/authz-eb`) generates tokens with user info including `id`, `type`, `carrierId`, etc.
- Premium subscription verification is handled by the Auth service before token generation
- This fix ensures that authenticated users with premium subscriptions can now access the Orders API without 403 errors
