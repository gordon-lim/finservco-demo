# FinServCo Monorepo

A financial services platform monorepo built with TypeScript and Node.js.

## Architecture

```
finservco-monorepo/
├── packages/
│   ├── common/          # Shared types, constants, utilities
│   ├── logger/          # Centralized structured logging
│   └── validators/      # Input validation for financial data
├── services/
│   ├── account-service/      # Account management (CRUD, balance)
│   ├── transaction-service/  # Transaction processing (deposits, withdrawals, transfers)
│   ├── risk-engine/          # Risk assessment and fraud detection
│   └── notification-service/ # Email/SMS notification delivery
├── apps/
│   └── dashboard/       # Internal admin dashboard
├── package.json         # Root workspace configuration
└── tsconfig.json        # TypeScript project references
```

## Getting Started

### Prerequisites

- Node.js >= 18
- npm >= 9

### Installation

```bash
npm install
```

### Running Services

Each service can be started individually:

```bash
# Account Service (port 3001)
npm run dev:accounts

# Transaction Service (port 3002)
npm run dev:transactions

# Risk Engine (port 3003)
npm run dev:risk

# Notification Service (port 3004)
npm run dev:notifications

# Dashboard (port 3000)
npm run dev:dashboard
```

### Running Tests

```bash
npm test
```

### Linting

```bash
npm run lint
```

### Type Checking

```bash
npm run typecheck
```

## Services

### Account Service (`services/account-service`)
Manages customer accounts including creation, updates, status changes, and balance queries.

**Endpoints:**
- `GET /api/accounts` - List accounts (paginated)
- `GET /api/accounts/:id` - Get account by ID
- `POST /api/accounts` - Create new account
- `PUT /api/accounts/:id` - Update account
- `DELETE /api/accounts/:id` - Close account

### Transaction Service (`services/transaction-service`)
Processes financial transactions including deposits, withdrawals, and inter-account transfers.

**Endpoints:**
- `GET /api/transactions` - List transactions (filterable by account)
- `GET /api/transactions/:id` - Get transaction by ID
- `POST /api/transactions/deposit` - Create deposit
- `POST /api/transactions/withdrawal` - Create withdrawal
- `POST /api/transactions/transfer` - Transfer between accounts

### Risk Engine (`services/risk-engine`)
Evaluates transactions against configurable risk rules for fraud detection and compliance.

**Endpoints:**
- `POST /api/risk/assess` - Assess transaction risk

### Notification Service (`services/notification-service`)
Sends transactional notifications via email and SMS channels.

**Endpoints:**
- `POST /api/notifications/send` - Send notification
- `GET /api/notifications` - List notification history
- `GET /api/notifications/:id` - Get notification by ID

## Shared Packages

- **@finservco/common** - Shared TypeScript types, error classes, constants, and utility functions
- **@finservco/logger** - Structured JSON logging with configurable levels
- **@finservco/validators** - Input validation for financial data (amounts, account numbers, currencies)

## Tech Stack

- **Language:** TypeScript 5.3
- **Runtime:** Node.js 18+
- **Framework:** Express.js
- **Monorepo:** npm workspaces
- **Testing:** Jest with ts-jest
- **Linting:** ESLint with TypeScript plugin
