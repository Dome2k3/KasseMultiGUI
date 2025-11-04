# CORS and Session Authentication Fix

## Problem
Users with Editor or Admin permissions could login successfully and view data (GET requests worked), but received 403 "Authentifizierung erforderlich. Bitte über 'Bearbeitungsmodus' anmelden." errors when attempting to create, update, or delete data (POST/PUT/DELETE requests failed).

## Root Cause
The frontend JavaScript code was not including `credentials: 'include'` in fetch requests, which meant cookies containing the JWT session token were not being sent to the backend. Without the session cookie, the backend authentication middleware could not verify the user's identity and permissions.

## Solution
Added `credentials: 'include'` to all fetch calls in the frontend code, ensuring that cookies are sent with every request to the backend API.

## Files Modified

### Frontend Files
1. **helferplan/public/js/main.js**
   - Added credentials to 21 fetch calls (GET, POST, DELETE)
   - Affects: teams, helpers, activity groups, activities, settings management

2. **helferplan/public/js/plan.js**
   - Added credentials to 2 GET fetch calls
   - Affects: activities and allowed time blocks

3. **helferplan/public/aufbau-abbau.html**
   - Added credentials to 6 fetch calls
   - Affects: setup/cleanup shift management

4. **helferplan/public/kuchen.html**
   - Added credentials to 6 fetch calls
   - Affects: cake donation management

5. **helferplan/public/plan-admin.html**
   - Added credentials to 2 fetch calls
   - Affects: activity and time block administration

### Backend Files
6. **helferplan/helferplan.js**
   - Made cookie `sameSite` mode configurable via environment variable
   - Improved cross-domain support

## Configuration

### Environment Variables

#### COOKIE_SAMESITE
Controls the `sameSite` attribute of the session cookie.

**Default:** `lax`
**Options:**
- `lax` - Works for same-site requests and top-level navigation (default)
  - Use this when frontend and backend are on the same domain
  - Also works for localhost with different ports (e.g., localhost:8080 ↔ localhost:3003)
- `none` - Allows cross-site cookies (requires HTTPS in production)
  - Use this when frontend is served from a different domain than the API
  - Requires `secure: true` (automatically enabled when using `none`)

**Example:**
```bash
# For same-site or localhost development
export COOKIE_SAMESITE=lax

# For cross-domain production deployment (requires HTTPS)
export COOKIE_SAMESITE=none
```

#### ALLOWED_ORIGINS
Comma-separated list of origins allowed to make requests to the API.

**Default:** `http://localhost:3003, http://localhost:8080, http://127.0.0.1:3003, http://127.0.0.1:8080`

**Example:**
```bash
export ALLOWED_ORIGINS="https://helferplan.example.com,https://admin.example.com"
```

#### HELFERPLAN_SESSION_SECRET
Secret key used to sign JWT tokens. **Must be set in production!**

**Default:** `change-this-secret-in-production`

**Example:**
```bash
# Generate a secure random secret
export HELFERPLAN_SESSION_SECRET="$(openssl rand -base64 32)"
```

## Deployment Checklist

### 1. Update Environment Variables
```bash
# Set session secret (REQUIRED for production)
export HELFERPLAN_SESSION_SECRET="your-secure-random-secret-here"

# Set allowed origins if frontend is on different domain
export ALLOWED_ORIGINS="https://your-frontend-domain.com"

# Set cookie sameSite mode for cross-domain (if needed)
export COOKIE_SAMESITE=none  # Only if frontend is on different domain + using HTTPS
```

### 2. Restart the Server
```bash
cd helferplan
npm install  # If dependencies changed
npm start
```

### 3. Clear Browser Cache and Cookies
Users should clear their browser cache and cookies for the application domain, or use a private/incognito window for testing.

## Testing

### Test Authentication Flow
1. Open the application in a browser
2. Click the "Bearbeitungsmodus" button
3. Enter name and email
4. Verify login succeeds and user information is displayed

### Test Write Operations (Editor/Admin)
As a user with Editor or Admin permissions:

1. **Teams Management** (main.js)
   - Create a new team → Should succeed
   - Delete a team → Should succeed

2. **Helpers Management** (main.js)
   - Add a new helper → Should succeed
   - Delete a helper → Should succeed

3. **Activities Management** (main.js)
   - Create an activity group → Should succeed
   - Delete an activity group → Should succeed
   - Create an activity → Should succeed
   - Delete an activity → Should succeed

4. **Settings Management** (main.js)
   - Update event dates → Should succeed
   - Update setup/cleanup settings → Should succeed
   - Update cake count settings → Should succeed

5. **Tournament Shifts** (plan.js)
   - Create a new shift → Should succeed
   - Delete a shift → Should succeed

6. **Setup/Cleanup Shifts** (aufbau-abbau.html)
   - Add a shift → Should succeed
   - View existing shifts → Should work

7. **Cake Donations** (kuchen.html)
   - Add a cake donation → Should succeed
   - View donations → Should work

8. **Time Block Administration** (plan-admin.html, Admin only)
   - Configure allowed time blocks for activities → Should succeed

### Expected Behavior
- All write operations should succeed without 403 errors
- Success messages or alerts should be displayed
- Data should persist after page refresh
- Audit log entries should be created in the database

### Troubleshooting

#### Still Getting 403 Errors
1. Verify cookies are enabled in browser
2. Check browser console for CORS errors
3. Verify `ALLOWED_ORIGINS` includes the frontend origin
4. Ensure user has Editor or Admin permissions in database:
   ```sql
   SELECT email, display_name, is_editor, is_admin 
   FROM helferplan_users 
   WHERE email = 'user@example.com';
   ```
5. Grant permissions if needed:
   ```sql
   UPDATE helferplan_users 
   SET is_editor = 1 
   WHERE email = 'user@example.com';
   ```

#### Cookies Not Being Set
1. Verify backend is running and accessible
2. Check if HTTPS is required (production with `COOKIE_SAMESITE=none`)
3. Ensure frontend and backend domains match `ALLOWED_ORIGINS`
4. Check browser DevTools → Application → Cookies to see if cookie is present

#### CORS Errors
1. Verify `ALLOWED_ORIGINS` includes the exact origin (including protocol and port)
2. Check backend console for CORS-related log messages
3. Ensure `credentials: true` is set in backend CORS configuration (already configured)

## Security Considerations

1. **HTTPS Required in Production**
   - When using `COOKIE_SAMESITE=none`, HTTPS is mandatory
   - Session cookies are marked as `secure: true` in production

2. **Session Secret**
   - Use a strong, random secret for `HELFERPLAN_SESSION_SECRET`
   - Never commit secrets to version control
   - Rotate secrets periodically

3. **CORS Origins**
   - Only add trusted domains to `ALLOWED_ORIGINS`
   - Be specific (include protocol and port)
   - Avoid using wildcards in production

4. **Cookie Settings**
   - Cookies are HTTP-only (prevents XSS attacks)
   - Secure flag enabled in production (requires HTTPS)
   - 24-hour expiration

## Additional Resources

- [MDN: Using Fetch with credentials](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch#sending_a_request_with_credentials_included)
- [MDN: Set-Cookie sameSite attribute](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie/SameSite)
- [MDN: CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS)

## Support

If issues persist after following this guide:
1. Check browser console for error messages
2. Check backend server logs
3. Review audit logs in database:
   ```sql
   SELECT * FROM helferplan_audit 
   ORDER BY timestamp DESC 
   LIMIT 50;
   ```
4. Verify database permissions for the user
