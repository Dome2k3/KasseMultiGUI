# Helferplan Authentication and Audit Logging

## Overview

The Helferplan module now includes email-based authentication with session management and comprehensive audit logging for all data modifications.

## Features

### 1. Email-Based Authentication

Users can identify themselves using their name and email address. The system:
- Creates a user record on first login
- Updates the display name and last_seen timestamp on subsequent logins
- Issues a JWT session token valid for 24 hours
- Stores the token as an HTTP-only secure cookie (with JSON fallback)

### 2. Role-Based Access Control

Three permission levels:
- **Viewer**: Can view data but cannot make changes
- **Editor** (`is_editor=1`): Can create, update, and delete most records
- **Admin** (`is_admin=1`): Has editor rights plus can modify time block restrictions

### 3. Audit Logging

All write operations (CREATE, UPDATE, DELETE) are logged to the `helferplan_audit` table with:
- User ID and display name
- Action type and target table
- Row ID of affected record
- Before/after data (JSON)
- IP address and user agent
- Timestamp

## Database Schema

### helferplan_users

```sql
CREATE TABLE helferplan_users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    display_name VARCHAR(255) NOT NULL,
    is_editor TINYINT(1) NOT NULL DEFAULT 0,
    is_admin TINYINT(1) NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    extra JSON DEFAULT NULL
);
```

### helferplan_audit

```sql
CREATE TABLE helferplan_audit (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT DEFAULT NULL,
    actor_name VARCHAR(255) NOT NULL,
    action ENUM('CREATE', 'UPDATE', 'DELETE') NOT NULL,
    table_name VARCHAR(100) NOT NULL,
    row_id INT DEFAULT NULL,
    timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ip_addr VARCHAR(45) DEFAULT NULL,
    user_agent TEXT DEFAULT NULL,
    before_data JSON DEFAULT NULL,
    after_data JSON DEFAULT NULL,
    note TEXT DEFAULT NULL
);
```

## API Endpoints

### Authentication

#### POST /api/auth/identify
Identifies or creates a user and returns a session token.

**Request:**
```json
{
  "name": "John Doe",
  "email": "john.doe@example.com"
}
```

**Response:**
```json
{
  "token": "eyJhbGc...",
  "user": {
    "id": 1,
    "email": "john.doe@example.com",
    "display_name": "John Doe",
    "is_editor": false,
    "is_admin": false
  }
}
```

#### GET /api/current-user
Returns the current authenticated user.

**Response (authenticated):**
```json
{
  "authenticated": true,
  "user": {
    "id": 1,
    "email": "john.doe@example.com",
    "display_name": "John Doe",
    "is_editor": false,
    "is_admin": false
  }
}
```

**Response (not authenticated):**
```json
{
  "authenticated": false
}
```

#### DELETE /api/auth/session
Clears the current session.

**Response:**
```json
{
  "message": "Session beendet."
}
```

### Protected Endpoints

The following endpoints now require authentication:

**Editor Role Required:**
- POST /api/teams
- POST /api/helpers
- DELETE /api/helpers/:id
- POST /api/activity-groups
- DELETE /api/activity-groups/:id
- POST /api/activities
- DELETE /api/activities/:id
- POST /api/tournament-shifts
- DELETE /api/tournament-shifts/:id
- DELETE /api/tournament-shifts (body-based)
- POST /api/setup-cleanup-shifts
- DELETE /api/setup-cleanup-shifts/:id
- POST /api/cakes
- DELETE /api/cakes/:id
- POST /api/settings

**Admin Role Required:**
- POST /api/activities/:id/allowed-time-blocks

## Environment Variables

### HELFERPLAN_SESSION_SECRET
JWT signing secret. Should be set to a random, secure string in production.

**Default:** `'change-this-secret-in-production'`

**Example:**
```bash
export HELFERPLAN_SESSION_SECRET="your-very-secure-random-secret-here"
```

## Frontend Usage

### plan.html & plan-admin.html

Both pages include:
- "Bearbeitungsmodus" button to trigger authentication
- Auth status display showing current user
- Logout button when authenticated
- Authentication modal for entering name and email

### User Workflow

1. User clicks "Bearbeitungsmodus" button
2. Modal appears requesting name and email
3. User submits credentials
4. System creates/updates user record
5. If user has editor/admin rights, they can make changes
6. If not, they see a message to contact an administrator
7. User can logout using the "Abmelden" button

## Granting Permissions

To grant editor or admin rights to a user:

```sql
-- Grant editor rights
UPDATE helferplan_users 
SET is_editor = 1 
WHERE email = 'user@example.com';

-- Grant admin rights (includes editor rights)
UPDATE helferplan_users 
SET is_admin = 1, is_editor = 1 
WHERE email = 'user@example.com';
```

## Viewing Audit Logs

```sql
-- View recent changes
SELECT 
    a.timestamp,
    a.actor_name,
    a.action,
    a.table_name,
    a.row_id,
    a.before_data,
    a.after_data
FROM helferplan_audit a
ORDER BY a.timestamp DESC
LIMIT 50;

-- View changes by specific user
SELECT 
    a.timestamp,
    a.action,
    a.table_name,
    a.row_id
FROM helferplan_audit a
WHERE a.user_id = 1
ORDER BY a.timestamp DESC;

-- View changes to specific table
SELECT 
    a.timestamp,
    a.actor_name,
    a.action,
    a.row_id,
    a.before_data,
    a.after_data
FROM helferplan_audit a
WHERE a.table_name = 'helferplan_tournament_shifts'
ORDER BY a.timestamp DESC;
```

## Security Considerations

1. **HTTPS in Production**: Always use HTTPS in production to protect session tokens
2. **Secure Cookies**: Cookies are marked as `Secure` when `NODE_ENV=production`
3. **JWT Secret**: Use a strong, random secret for JWT signing
4. **Session Expiry**: Tokens expire after 24 hours
5. **HTTP-Only Cookies**: Session cookies are HTTP-only to prevent XSS attacks

## Migration

To migrate an existing installation:

1. Run the SQL migration script:
   ```bash
   mysql -u root -p volleyball_turnier < helferplan/migration_auth_audit.sql
   ```

2. Set the session secret:
   ```bash
   export HELFERPLAN_SESSION_SECRET="$(openssl rand -base64 32)"
   ```

3. Restart the server:
   ```bash
   cd helferplan
   npm install
   npm start
   ```

4. Grant initial admin rights:
   ```sql
   UPDATE helferplan_users 
   SET is_admin = 1, is_editor = 1 
   WHERE email = 'your-admin-email@example.com';
   ```

## Troubleshooting

### "Authentifizierung erforderlich" error
- User needs to click "Bearbeitungsmodus" and enter their credentials
- Verify the user has editor or admin rights in the database

### Session expires too quickly
- Default is 24 hours
- Check if server time is correct
- Verify `HELFERPLAN_SESSION_SECRET` is consistent across restarts

### Audit logs not appearing
- Check database table exists: `SHOW TABLES LIKE 'helferplan_audit';`
- Verify user is authenticated when making changes
- Check server logs for errors

## Support

For issues or questions, please check the audit logs and server console output for error messages.
