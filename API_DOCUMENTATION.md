# NFC Card Backend — API Documentation

REST API for the Digital NFC Business Card platform.

| | |
|---|---|
| **Base URL (local)** | `http://localhost:5000` |
| **Interactive docs** | `http://localhost:5000/api-docs` (Swagger UI, enabled in development) |
| **Health check** | `GET /health` |

---

## Table of Contents

1. [Authentication](#authentication)
2. [Response Format](#response-format)
3. [Error Handling](#error-handling)
4. [Rate Limiting](#rate-limiting)
5. [System](#system)
6. [Auth — `/api/auth`](#auth--apiauth)
7. [Public Cards — `/api/c`](#public-cards--apic)
8. [Cards — `/api/cards`](#cards--apicards)
9. [Profile — `/api/profile`](#profile--apiprofile)
10. [User Analytics — `/api/user`](#user-analytics--apiuser)
11. [Business — `/api/business`](#business--apibusiness)
12. [Menus — `/api/menu`](#menus--apimenu)
13. [Orders — `/api/orders`](#orders--apiorders)
14. [Payments — `/api/payments`](#payments--apipayments)
15. [Admin — `/api/admin`](#admin--apiadmin)
16. [Enums & Status Values](#enums--status-values)
17. [Demo Credentials](#demo-credentials)

---

## Authentication

Protected routes require a JWT in the `Authorization` header:

```http
Authorization: Bearer <token>
```

Obtain a token via `POST /api/auth/login` or `POST /api/auth/register`.

### Roles

| Role | Access |
|------|--------|
| `USER` | Own profile, cards, analytics, payments |
| `BUSINESS` | Everything `USER` can do, plus business profile, menus, orders |
| `ADMIN` | Full system access via `/api/admin/*` |

---

## Response Format

### Success (JSON)

```json
{
  "success": true,
  "data": { },
  "message": "Optional human-readable message"
}
```

### Error (JSON)

```json
{
  "success": false,
  "error": "Error message"
}
```

Validation errors may also include field details:

```json
{
  "success": false,
  "error": "Validation failed",
  "details": {
    "email": ["Invalid email format"]
  }
}
```

### CSV responses

Some export endpoints return `text/csv` with a `Content-Disposition: attachment` header instead of JSON.

---

## Error Handling

| Status | Meaning |
|--------|---------|
| `400` | Bad request / validation failed |
| `401` | Missing or invalid JWT |
| `403` | Authenticated but not authorized (wrong role or resource owner) |
| `404` | Resource not found |
| `409` | Conflict (e.g. email already registered, card already linked) |
| `429` | Rate limit exceeded |
| `500` | Internal server error |

---

## Rate Limiting

| Scope | Limit |
|-------|-------|
| Global | 200 requests / 15 minutes per IP |
| `/api/auth/*` | 20 requests / 15 minutes per IP |

---

## System

### `GET /health`

Health check. No authentication required.

**Response `200`**

```json
{
  "status": "healthy",
  "timestamp": "2026-06-25T10:00:00.000Z",
  "uptime": 123.45
}
```

### `GET /`

API root. No authentication required.

**Response `200`**

```json
{
  "success": true,
  "message": "NFC Card API is running",
  "docs": "/api-docs"
}
```

---

## Auth — `/api/auth`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/register` | No | Create account |
| `POST` | `/login` | No | Login and get JWT |
| `POST` | `/forgot-password` | No | Request password reset email |
| `POST` | `/reset-password` | No | Reset password with email token |
| `GET` | `/me` | Yes | Get current user from JWT |
| `GET` | `/:cardId` | No | **Legacy** — public card view (prefer `/api/c/:cardId`) |
| `GET` | `/:cardId/vcard` | No | **Legacy** — download vCard (prefer `/api/c/:cardId/vcard`) |

### `POST /api/auth/register`

Create a new user account. Optionally activate a card at signup.

**Request body**

```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "password1",
  "role": "USER",
  "cardId": "CARD_AB3K2L"
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `name` | string | Yes | 2–100 characters |
| `email` | string | Yes | Valid email |
| `password` | string | Yes | Min 8 chars, at least one digit |
| `role` | string | No | `USER` (default) or `BUSINESS`. `ADMIN` cannot be self-registered |
| `cardId` | string | No | Activates this card if unassigned |

**Response `201`**

```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "user": {
      "id": "clx...",
      "name": "John Doe",
      "email": "john@example.com",
      "role": "USER"
    }
  },
  "message": "Account created successfully"
}
```

---

### `POST /api/auth/login`

**Request body**

```json
{
  "email": "admin@nfccard.com",
  "password": "admin123!"
}
```

**Response `200`**

```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "user": {
      "id": "clx...",
      "name": "System Admin",
      "email": "admin@nfccard.com",
      "role": "ADMIN"
    }
  },
  "message": "Login successful"
}
```

---

### `POST /api/auth/forgot-password`

Sends a password reset email if the address is registered. Always returns `200` to prevent email enumeration.

**Request body**

```json
{
  "email": "john@example.com"
}
```

**Response `200`**

```json
{
  "success": true,
  "message": "If that email is registered, a reset link has been sent."
}
```

---

### `POST /api/auth/reset-password`

**Request body**

```json
{
  "token": "reset-token-from-email",
  "password": "newpassword1"
}
```

**Response `200`**

```json
{
  "success": true,
  "message": "Password reset successfully. You can now log in."
}
```

---

### `GET /api/auth/me`

**Response `200`**

```json
{
  "success": true,
  "data": {
    "user": {
      "userId": "clx...",
      "email": "john@example.com",
      "role": "USER"
    }
  }
}
```

---

## Public Cards — `/api/c`

Primary public endpoints hit when someone scans an NFC tag or QR code.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/:cardId` | No | Get public card data |
| `GET` | `/:cardId/vcard` | No | Download `.vcf` contact file (personal cards only) |

### `GET /api/c/:cardId`

Records a scan event in the background (non-blocking). No authentication required.

**Path parameter:** `cardId` — public card ID (e.g. `CARD_DEMO1`)

#### Response — unassigned card

```json
{
  "success": true,
  "data": {
    "type": "unassigned",
    "cardId": "CARD_XXXXXX",
    "message": "This card has not been activated yet."
  }
}
```

#### Response — personal card

```json
{
  "success": true,
  "data": {
    "type": "personal",
    "cardId": "CARD_DEMO1",
    "profile": {
      "fullName": "Jane Smith",
      "jobTitle": "Software Engineer",
      "company": "Acme Corp",
      "phone": "+250788000000",
      "email": "jane@example.com",
      "website": "https://jane.com",
      "bio": "Building cool things.",
      "imageUrl": "https://res.cloudinary.com/...",
      "coverImageUrl": null,
      "whatsapp": "250788000000",
      "links": [
        {
          "id": "clx...",
          "type": "linkedin",
          "label": "LinkedIn",
          "url": "https://linkedin.com/in/jane",
          "order": 0
        }
      ]
    }
  }
}
```

#### Response — business card

```json
{
  "success": true,
  "data": {
    "type": "business",
    "cardId": "CARD_BIZ01",
    "business": {
      "id": "clx...",
      "name": "Mama Restaurant",
      "category": "restaurant",
      "description": "Traditional African cuisine",
      "location": "Kigali, Rwanda",
      "phone": "0788123456",
      "email": "info@mama.rw",
      "website": "https://mama.rw",
      "imageUrl": "https://res.cloudinary.com/...",
      "paymentCode": "123456",
      "menus": [
        {
          "id": "clx...",
          "title": "Breakfast Menu",
          "items": [
            {
              "id": "clx...",
              "name": "African Tea",
              "price": 2500,
              "description": "Spiced ginger tea",
              "imageUrl": null
            }
          ]
        }
      ],
      "whatsapp": "250788000000",
      "links": []
    }
  }
}
```

---

### `GET /api/c/:cardId/vcard`

Downloads a vCard (`.vcf`) file for "Add to Contacts". Only works for **personal** cards with a profile.

**Response `200`** — `Content-Type: text/vcard`, file download

**Response `404`** — No personal profile on this card

---

## Cards — `/api/cards`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/my` | Yes | List authenticated user's cards |
| `GET` | `/:cardId/analytics` | Yes | Scan analytics for a card (owner or admin) |

### `GET /api/cards/my`

**Response `200`**

```json
{
  "success": true,
  "data": [
    {
      "id": "clx...",
      "cardId": "CARD_DEMO1",
      "status": "ACTIVE",
      "createdAt": "2026-01-01T00:00:00.000Z",
      "_count": { "scans": 42 }
    }
  ]
}
```

---

### `GET /api/cards/:cardId/analytics`

**Path parameter:** `cardId` — public card ID

**Response `200`**

```json
{
  "success": true,
  "data": {
    "totalScans": 42,
    "dailyBreakdown": [
      { "date": "2026-06-20", "count": 5 }
    ],
    "deviceBreakdown": {
      "mobile": 30,
      "desktop": 12
    }
  }
}
```

---

## Profile — `/api/profile`

All routes require authentication (`requireAuth` applied to the entire router).

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/` | Yes | Get own profile with links |
| `PUT` | `/` | Yes | Update profile and replace links |
| `POST` | `/photo` | Yes | Upload profile photo |
| `POST` | `/cover` | Yes | Upload cover/banner photo |

### `GET /api/profile`

**Response `200`** — Profile object including `links` array ordered by `order`.

---

### `PUT /api/profile`

Updates profile fields. If `links` is provided, **all existing links are replaced** atomically.

**Request body** (all fields optional except validation rules when present)

```json
{
  "fullName": "Jane Smith",
  "jobTitle": "Software Engineer",
  "company": "Acme Corp",
  "phone": "+250788000000",
  "email": "jane@example.com",
  "website": "https://jane.com",
  "bio": "A short bio (max 500 chars)",
  "imageUrl": "https://res.cloudinary.com/...",
  "whatsapp": "250788000000",
  "links": [
    {
      "type": "linkedin",
      "label": "My LinkedIn",
      "url": "https://linkedin.com/in/jane",
      "order": 0
    }
  ]
}
```

| Field | Constraints |
|-------|-------------|
| `fullName` | 1–100 chars |
| `links` | Max 10 items; each `url` must be valid HTTP(S) URL |
| `whatsapp` | Digits only, max 20 |

**Response `200`**

```json
{
  "success": true,
  "data": { },
  "message": "Profile updated successfully"
}
```

---

### `POST /api/profile/photo`

Upload profile photo to Cloudinary.

**Content-Type:** `multipart/form-data`

| Field | Type | Required |
|-------|------|----------|
| `photo` | file | Yes — JPEG, PNG, or WebP (max 5 MB) |

**Response `200`**

```json
{
  "success": true,
  "data": {
    "imageUrl": "https://res.cloudinary.com/..."
  }
}
```

---

### `POST /api/profile/cover`

Same as `/photo` but saves `coverImageUrl` on the profile.

**Content-Type:** `multipart/form-data` — field name `photo`

**Response `200`**

```json
{
  "success": true,
  "data": {
    "coverImageUrl": "https://res.cloudinary.com/..."
  }
}
```

---

## User Analytics — `/api/user`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/analytics/summary` | Yes | Today / week / total scan counts |
| `GET` | `/analytics/daily` | Yes | Daily scan trend |
| `GET` | `/scans` | Yes | Recent scan events |
| `GET` | `/scans/export` | Yes | Export scans as CSV |

### `GET /api/user/analytics/summary`

**Response `200`**

```json
{
  "success": true,
  "data": {
    "today": 5,
    "week": 20,
    "total": 150
  }
}
```

---

### `GET /api/user/analytics/daily`

**Query parameters**

| Param | Default | Description |
|-------|---------|-------------|
| `range` | `7d` | Date range, e.g. `7d`, `30d` |

**Response `200`**

```json
{
  "success": true,
  "data": [
    { "date": "2026-06-20", "count": 7 }
  ]
}
```

---

### `GET /api/user/scans`

**Query parameters**

| Param | Default | Description |
|-------|---------|-------------|
| `limit` | `50` | Max events to return |
| `after` | — | ISO datetime — return scans after this timestamp |

**Response `200`**

```json
{
  "success": true,
  "data": [
    {
      "timestamp": "2026-06-25T10:00:00.000Z",
      "device": "mobile",
      "ip": "197.243.0.1",
      "userAgent": "Mozilla/5.0 ...",
      "card": { "cardId": "CARD_DEMO1" }
    }
  ]
}
```

---

### `GET /api/user/scans/export`

**Response `200`** — CSV file download

---

## Business — `/api/business`

Requires authentication. Write routes also require `BUSINESS` role (`requireBusiness`).

| Method | Path | Auth | Role | Description |
|--------|------|------|------|-------------|
| `POST` | `/` | Yes | BUSINESS | Create or update business profile |
| `GET` | `/` | Yes | BUSINESS | Get business profile with menus and cards |
| `GET` | `/card` | Yes | BUSINESS | List cards linked to business |
| `POST` | `/card` | Yes | BUSINESS | Link a card to this business |

### `POST /api/business`

Create or update the authenticated user's business profile.

**Content-Type:** `multipart/form-data`

| Field | Type | Required |
|-------|------|----------|
| `name` | string | Yes |
| `category` | string | Yes — e.g. `restaurant`, `hotel` |
| `description` | string | No |
| `location` | string | No |
| `phone` | string | No |
| `email` | string | No |
| `website` | string | No |
| `paymentCode` | string | No — MTN MoMo merchant code for customer orders |
| `photo` | file | No — business logo/image |

**Response `200`**

```json
{
  "success": true,
  "data": { },
  "message": "Business profile saved successfully"
}
```

---

### `GET /api/business`

Returns full business profile including `menus` (with `items`) and linked `cards`.

---

### `GET /api/business/card`

**Response `200`**

```json
{
  "success": true,
  "data": [
    {
      "id": "clx...",
      "cardId": "CARD_8F3K2L",
      "status": "ACTIVE"
    }
  ]
}
```

---

### `POST /api/business/card`

Link an existing physical card to this business. Once linked, scanning the card shows the business menu.

**Request body**

```json
{
  "cardId": "CARD_8F3K2L"
}
```

**Response `200`**

```json
{
  "success": true,
  "message": "Card linked to your business successfully"
}
```

**Errors:** `404` card/business not found, `409` card already linked to another business

---

## Menus — `/api/menu`

Requires authentication and `BUSINESS` role.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/` | Yes | Create a menu category |
| `GET` | `/` | Yes | List menus (paginated) with items |
| `POST` | `/:menuId/items` | Yes | Add item to a menu |
| `DELETE` | `/:menuId/items/:itemId` | Yes | Delete a menu item |

### `POST /api/menu`

**Request body**

```json
{
  "title": "Breakfast Menu"
}
```

**Response `201`** — Created menu object

---

### `GET /api/menu`

**Query parameters**

| Param | Default | Description |
|-------|---------|-------------|
| `page` | `1` | Page number |
| `limit` | `10` | Items per page |

**Response `200`**

```json
{
  "success": true,
  "data": [ ],
  "pagination": { }
}
```

---

### `POST /api/menu/:menuId/items`

**Content-Type:** `multipart/form-data`

| Field | Type | Required |
|-------|------|----------|
| `name` | string | Yes |
| `price` | number | Yes — price in RWF |
| `description` | string | No |
| `photo` | file | No — item image |

**Response `201`** — Created menu item

---

### `DELETE /api/menu/:menuId/items/:itemId`

**Response `200`**

```json
{
  "success": true,
  "message": "Menu item deleted"
}
```

---

## Orders — `/api/orders`

Customer order flow for business cards (food ordering via MoMo).

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/` | No | Customer places order |
| `POST` | `/:id/txid` | No | Customer submits MoMo transaction ID |
| `GET` | `/:id/status` | No | Poll order status |
| `GET` | `/business` | Yes | Business lists incoming orders |
| `GET` | `/business/export` | Yes | Export orders as CSV |
| `POST` | `/:id/confirm` | Yes | Business confirms payment |
| `POST` | `/:id/reject` | Yes | Business rejects order |
| `DELETE` | `/:id` | Yes | Business deletes completed/rejected order |

### Order status flow

```
PENDING → WAITING_VERIFICATION → PAID
                               → REJECTED
```

### `POST /api/orders`

**Request body**

```json
{
  "businessId": "clx...",
  "customerName": "Alice",
  "phone": "0788123456",
  "items": [
    {
      "id": "item-id",
      "name": "African Tea",
      "price": 2500,
      "qty": 2,
      "imageUrl": null
    }
  ]
}
```

> Total is calculated server-side from `items` — never trust a client-supplied total.

**Response `201`**

```json
{
  "success": true,
  "data": {
    "id": "clx...",
    "businessId": "clx...",
    "customerName": "Alice",
    "phone": "0788123456",
    "total": 5000,
    "status": "PENDING",
    "txId": null,
    "items": [ ],
    "createdAt": "2026-06-25T10:00:00.000Z"
  }
}
```

---

### `POST /api/orders/:id/txid`

Customer submits MoMo transaction ID after paying.

**Request body**

```json
{
  "txId": "1234567890"
}
```

**Response `200`** — Order with `status: "WAITING_VERIFICATION"`

---

### `GET /api/orders/:id/status`

Public status polling for customers.

**Response `200`** — Full order object including `business.name`

---

### `GET /api/orders/business`

**Query parameters:** `page` (default `1`), `limit` (default `20`, max `100`)

**Response `200`**

```json
{
  "success": true,
  "data": [ ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 5,
    "pages": 1
  }
}
```

---

### `GET /api/orders/business/export`

**Response `200`** — CSV file download

---

### `POST /api/orders/:id/confirm`

Business owner verifies TxId and marks order as paid.

**Response `200`** — Order with `status: "PAID"`

---

### `POST /api/orders/:id/reject`

Business owner rejects order (wrong TxId or amount).

**Response `200`** — Order with `status: "REJECTED"`

---

### `DELETE /api/orders/:id`

Only `PAID` or `REJECTED` orders can be deleted.

**Response `200`**

```json
{
  "success": true,
  "message": "Order deleted"
}
```

---

## Payments — `/api/payments`

Subscription payments via Paypack (MTN MoMo / Airtel Money).

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/initiate` | Yes | Start a subscription payment |
| `POST` | `/webhook` | No | Paypack payment callback (provider only) |
| `GET` | `/my` | Yes | User payment history (paginated) |
| `GET` | `/:id` | Yes | Get single payment |
| `GET` | `/:id/status` | Yes | Poll payment status |

### `POST /api/payments/initiate`

Creates a pending payment and sends a USSD push to the customer's phone via Paypack.

**Request body**

```json
{
  "plan": "PLUS",
  "billingCycle": "MONTHLY",
  "amount": 5000,
  "phone": "0788123456",
  "method": "MTN"
}
```

| Field | Values |
|-------|--------|
| `plan` | `FREE`, `PLUS`, `BUSINESS` |
| `billingCycle` | `MONTHLY`, `ANNUAL` |
| `method` | `MTN`, `AIRTEL` |
| `phone` | Rwanda mobile number |
| `amount` | Amount in RWF |

**Response `200`**

```json
{
  "success": true,
  "data": {
    "message": "Payment request sent to your phone. Please approve it.",
    "paymentId": "clx...",
    "reference": "paypack-ref-123"
  }
}
```

---

### `POST /api/payments/webhook`

Called by Paypack when payment status changes. **Not for frontend use.**

Register this URL on the Paypack dashboard:

```
https://<your-backend-domain>/api/payments/webhook
```

**Request body (from Paypack)**

```json
{
  "ref": "paypack-ref-123",
  "status": "successful"
}
```

`status` values: `successful`, `failed`, `pending`

**Response `200`** — Acknowledged immediately

---

### `GET /api/payments/my`

**Query parameters:** `page` (default `1`), `limit` (default `10`)

**Response `200`** — Paginated payment list

---

### `GET /api/payments/:id`

**Response `200`** — Single payment record (owner only)

---

### `GET /api/payments/:id/status`

Manual status poll as fallback when webhook hasn't fired yet.

**Response `200`**

```json
{
  "success": true,
  "data": {
    "status": "SUCCESS"
  }
}
```

---

## Admin — `/api/admin`

All routes require authentication **and** `ADMIN` role.

### Cards

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/cards` | List all cards with owners and scan counts |
| `POST` | `/cards` | Generate new unassigned cards |
| `PUT` | `/cards/:cardId/assign` | Assign card to a user |
| `GET` | `/cards/count` | Total card count |
| `GET` | `/cards/top` | Top scanned cards |
| `GET` | `/cards/active` | Active cards in date range |

#### `POST /api/admin/cards`

**Request body**

```json
{
  "count": 5
}
```

`count` — 1–100, default `1`

**Response `201`** — Array of created card objects

---

#### `PUT /api/admin/cards/:cardId/assign`

**Request body**

```json
{
  "userId": "clx..."
}
```

**Response `200`** — Activated card assigned to user (auto-links business profile if user is `BUSINESS`)

---

### Users

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/users` | Paginated user list |
| `GET` | `/users/count` | Total user count |
| `GET` | `/users/top` | Top users by scan count |
| `GET` | `/users/active` | Active users in date range |

**Query parameters (paginated routes):** `page` (default `1`), `size` (default `25`, max `100`)

**Query parameters (analytics routes):** `range` (e.g. `7d`, `30d`), `limit` (for top lists, default `5`)

---

### Analytics & Scans

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/stats` | System-wide stats overview |
| `GET` | `/scans/count` | Scan count for date range |
| `GET` | `/scans/daily` | Daily scan breakdown |
| `GET` | `/scans/export` | Export all scans as CSV |
| `GET` | `/analytics/daily-scans` | Daily scan totals (alias) |
| `GET` | `/analytics/top-cards` | Top cards in date range |
| `GET` | `/analytics/top-users` | Top users in date range |

#### `GET /api/admin/stats`

**Response `200`**

```json
{
  "success": true,
  "data": {
    "totalUsers": 50,
    "totalCards": 100,
    "totalScans": 500,
    "activeCards": 75
  }
}
```

---

### Businesses

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/businesses` | Paginated business list |
| `GET` | `/businesses/:id` | Full business detail with menus and cards |

---

### Payments

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/payments` | Paginated all payments system-wide |

**Query parameters:** `page`, `size`, `status` (`PENDING`, `SUCCESS`, `FAILED`)

---

## Enums & Status Values

### User roles

`USER` · `BUSINESS` · `ADMIN`

### Card status

`UNASSIGNED` · `ACTIVE`

### Order status

`PENDING` · `WAITING_VERIFICATION` · `PAID` · `REJECTED`

### Payment status

`PENDING` · `SUCCESS` · `FAILED`

### Plan types

`FREE` · `PLUS` · `BUSINESS`

### Billing cycle

`MONTHLY` · `ANNUAL`

### Payment method

`MTN` · `AIRTEL`

### Subscription status

`ACTIVE` · `EXPIRED` · `CANCELLED`

---

## Demo Credentials

Available after running `npm run db:seed` in the backend:

| Role | Email | Password |
|------|-------|----------|
| Admin | `admin@nfccard.com` | `admin123!` |
| User | `demo@nfccard.com` | `demo1234!` |
| Demo card | `CARD_DEMO1` | Visit `GET /api/c/CARD_DEMO1` |

---

## Quick cURL Examples

### Login

```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@nfccard.com","password":"admin123!"}'
```

### Get public card

```bash
curl http://localhost:5000/api/c/CARD_DEMO1
```

### Update profile (authenticated)

```bash
curl -X PUT http://localhost:5000/api/profile \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "fullName": "Jane Smith",
    "links": [
      {
        "type": "linkedin",
        "label": "LinkedIn",
        "url": "https://linkedin.com/in/jane",
        "order": 0
      }
    ]
  }'
```

### Upload profile photo

```bash
curl -X POST http://localhost:5000/api/profile/photo \
  -H "Authorization: Bearer <token>" \
  -F "photo=@/path/to/photo.jpg"
```

---

## Related Files

| File | Purpose |
|------|---------|
| `src/routes/index.ts` | All route definitions |
| `src/swagger.ts` | OpenAPI base config |
| `src/middleware/validate.middleware.ts` | Request validation schemas |
| `src/middleware/auth.middleware.ts` | JWT and role guards |
| `prisma/schema.prisma` | Database models |

For interactive testing, use **Swagger UI** at `/api-docs` when the server is running in development mode.
