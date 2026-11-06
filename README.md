# POS System

A Node.js/Express REST API for inventory and sales management, built with Sequelize and MySQL. It models the backend of a small retail or point-of-sale operation: products, stock, orders, and refunds, with role-based access control and a full audit trail of every stock change.

This project was built to demonstrate production-style backend design, not just CRUD: transactional order processing, partial refunds, and inventory traceability are the core of it.

## Features

**Authentication & Access Control**
- No open self-registration — account creation requires a valid one-time token.
- Role-based access control (`admin`, `employee`) enforced via middleware on every protected route, with routes split between `/api/v1/all/*` (any authenticated user) and `/api/v1/admin/*` (admin-only).
- JWT-based authentication.
- Password reset/change flows, including a token-based reset path.

**Product & Inventory Management**
- Full CRUD for products, with SKU, pricing, category, and low-stock threshold.
- Product lifecycle status (`active`, `inactive`, `discontinued`) instead of a simple on/off flag.
- Category management.
- Low-stock lookup endpoint.

**Order Processing**
- Orders are created with multiple line items in a single request.
- Stock availability is validated before an order is confirmed — insufficient stock rejects the whole order.
- The price of each item is locked in at the time of sale (`price_at_sale`), independent of later product price changes.
- Order creation, stock deduction, and order-item creation all happen inside a single database transaction, so a failure at any step rolls back cleanly with no partial writes.

**Partial Refunds**
- Refunds are scoped to individual order items and specific quantities, not just the order as a whole.
- Refunds go through a request → approval flow: any authenticated staff member can request a refund, but only an admin can approve or reject it, triggering the stock/order updates.
- Refunded quantity is validated against what's actually left on the line item, preventing over-refunding.

**Reporting**
- Sales summary, filterable by employee and date range.
- Order listing filterable by employee, date range, status, and payment method.

**Stock Audit Trail**
- Every stock change (sale, restock, refund, manual correction) is logged as its own record — quantity is never silently overwritten with no history.
- Each movement records who performed it, why, and what it was tied to (an order or a refund).
- Stock levels are reconstructable from history rather than trusted as a single mutable number.

**Query Utilities**
- Shared pagination, sorting, and search logic across list endpoints, with a per-route whitelist of sortable/searchable fields to prevent arbitrary column access.

## Tech Stack

- **Runtime:** Node.js
- **Framework:** Express
- **ORM:** Sequelize
- **Database:** MySQL
- **Auth:** JWT, bcrypt

## Project Structure

```
├── connection/     # Database connection setup
├── controllers/    # Request handlers / business logic
├── helpers/        # Shared utility functions (timestamps, query parsing, etc.)
├── middlewares/    # Auth, role checks, validation
├── models/         # Sequelize models and associations
├── routes/         # Express route definitions
├── util/           # Additional utilities
├── app.js          # App entry point
└── package.json
```

## Data Model

The schema is built around a few core relationships:

```
users ──< products (created_by)
users ──< orders (cashier_id)
users ──< stock_movements (performed_by)

categories ──< products

products ──< order_items ──> orders
products ──< stock_movements

orders ──< order_items
order_items ──< refunds
orders ──< refunds

stock_movements ──> orders (nullable)
stock_movements ──> refunds (nullable)
```

**Design notes:**
- `order_items.price_at_sale` and `order_items.subtotal` are immutable once written — they represent what was actually sold, independent of later price changes or refunds.
- `orders.total_amount` is never edited after creation, for the same reason. A separate `net_amount` field reflects the current balance after any approved refunds.
- Refund amounts and quantities are tracked per line item (`order_items.refunded_quantity`), so partial refunds are supported without losing the original sale record.
- `stock_movements` is an append-only audit log — every quantity change on a product is logged with a reason, a reference (order or refund), and who performed it.

## Getting Started

### Prerequisites
- Node.js (v18+ recommended)
- MySQL

### Installation

```bash
git clone https://github.com/NicolasFabillar/Inventory-Tracker.git
cd Inventory-Tracker
npm install
```

### Environment Variables

Create a `.env` file in the root directory:

```
DB_HOST=localhost
DB_NAME=inventory_tracker
DB_USER=your_db_user
DB_PASSWORD=your_db_password
JWT_SECRET=your_jwt_secret
PORT=3000
```

### Database Setup

Run migrations (or `sync`, depending on your setup) to create the tables.

### Run the server

```bash
npm start
```

### Initial Setup

There's no public self-registration — account creation requires a valid one-time token.

1. Seed the one-time-tokens table first
2. Use the generated token to register the first account via `POST /auth/register`.

### Testing with Postman

A Postman collection is included in the repo. Import it into Postman and use it to explore and test all available endpoints.

## API Overview

Routes are split by access level: `/api/v1/all/*` is available to any authenticated user (or public, for login/register), while `/api/v1/admin/*` is restricted to admin accounts.

**Accounts**

| Endpoint | Method | Description |
|---|---|---|
| `/api/v1/all/register` | POST | Register an account using a valid one-time token |
| `/api/v1/all/login` | POST | Authenticate with username or email, receive a JWT |
| `/api/v1/all/accounts/me` | GET | Get the current authenticated user's profile |
| `/api/v1/all/change-password` | PATCH | Change password (required on first login) |
| `/api/v1/all/change-password-token` | PATCH | Reset password using a token |
| `/api/v1/admin/show-all` | GET | List all users (admin) |
| `/api/v1/admin/:userId/search` | GET | Find a user by ID (admin) |

**Products**

| Endpoint | Method | Description |
|---|---|---|
| `/api/v1/all/products/show-all` | GET | List products (paginated, sortable, searchable) |
| `/api/v1/all/products/:productId/search` | GET | Find a product by ID |
| `/api/v1/admin/products/create` | POST | Create a product (admin) |
| `/api/v1/admin/products/:productId/update` | PUT | Update a product (admin) |
| `/api/v1/admin/products/show-all` | GET | List products, filterable by status (admin) |
| `/api/v1/admin/products/:productId/search` | GET | Find a product by ID (admin) |
| `/api/v1/admin/products/:productId/delete` | DELETE | Delete a product (admin) |
| `/api/v1/admin/products/low-stock` | GET | List products at or below their low-stock threshold (admin) |
| `/api/v1/admin/products/product-movement/:productId/show-all` | GET | Stock movement history for a product, filterable by date range and employee (admin) |

**Categories**

| Endpoint | Method | Description |
|---|---|---|
| `/api/v1/admin/categories/create` | POST | Create a category (admin) |
| `/api/v1/admin/categories/:categoryID/update` | PUT | Update a category (admin) |
| `/api/v1/admin/categories/show-all` | GET | List categories (admin) |

**Orders & Refunds**

| Endpoint | Method | Description |
|---|---|---|
| `/api/v1/all/orders/create` | POST | Create an order with multiple line items (validates and deducts stock transactionally) |
| `/api/v1/all/orders/:orderId/payOrder` | PUT | Mark an order as paid (cash, card, or e-wallet) |
| `/api/v1/all/orders/:orderId/refund` | PUT | Request a refund on specific order items and quantities |
| `/api/v1/all/orders/:orderId/refundAmount` | GET | Get the refunded amount for an order |
| `/api/v1/admin/orders/:orderId/refund/approve` | PUT | Approve or reject a refund request (admin) |
| `/api/v1/admin/orders/show-all` | GET | List all orders, filterable by employee and date range (admin) |
| `/api/v1/admin/orders/:orderId/search` | GET | Find an order by ID (admin) |
| `/api/v1/admin/orders/sales-summary` | GET | Sales summary, filterable by employee and date range (admin) |

All authenticated endpoints require a Bearer token:
```
Authorization: Bearer <token>
```

## Roadmap / Possible Extensions

- Till/register session tracking for full point-of-sale parity

## License

This project is for portfolio/demonstration purposes.
