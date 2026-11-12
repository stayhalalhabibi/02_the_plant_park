# 🌱 The Plant Park — Online Plant Nursery & Gardening Store

**The Plant Park** is a full-stack e-commerce web application designed to make purchasing plants and gardening products simple, convenient, and accessible.

The platform provides customers with an online shopping experience where they can explore different varieties of plants, discover gardening essentials, manage their shopping carts and favorites, securely complete purchases, and track their orders.

The project combines a responsive React frontend, a Node.js and Express backend, and a PostgreSQL database to deliver a structured, scalable, and user-friendly e-commerce solution.

---

## 1. Project Overview

The Plant Park aims to bring a traditional plant nursery experience online.

Customers can browse a collection of indoor plants, tropical plants, succulents, flowering plants, plant pots, seeds, soil, fertilizers, and other gardening essentials.

The application focuses on three important aspects:

- **User Experience:** A clean, attractive, responsive, and easy-to-navigate shopping interface.
- **E-commerce Functionality:** Complete shopping workflows, including cart management, checkout, payment processing, and order management.
- **Reliable Backend:** Structured database management, authentication, API development, server-side validation, and secure payment verification.

The platform is designed to support customers with different levels of gardening experience, from beginners purchasing their first indoor plant to gardening enthusiasts looking for additional supplies.

## 2. Project Objectives

The main objectives of The Plant Park are:

1. Develop a complete full-stack e-commerce application.
2. Provide an organized catalogue of plants and gardening products.
3. Implement secure passwordless customer authentication using OTP verification.
4. Build a reliable shopping cart and favorites system.
5. Integrate Razorpay for online payment processing.
6. Maintain customer, product, inventory, and order information using PostgreSQL.
7. Implement server-side pricing and discount calculations.
8. Develop a responsive interface for desktop and mobile devices.
9. Follow secure coding practices and maintainable software architecture.
10. Build a foundation that can be extended with administrative and additional e-commerce functionality.

## 3. Key Features

### A. Customer-Facing Features

**1. Homepage**

- Dedicated landing page introducing The Plant Park.
- Plant and gardening product sections.
- Category-based product discovery.
- Promotional and featured product sections.
- Navigation to important shopping pages.

**2. Product Catalogue**

Customers can explore products organized into categories, including:

- Indoor Plants
- Tropical Plants
- Succulents
- Flowering Plants
- Plant Pots
- Seeds
- Soil
- Fertilisers
- Garden Tools
- Watering
- Pest Control
- Gardening Decor

Product information can include:

- Product name.
- Description.
- Price.
- Category.
- Available stock.
- Product image.

**3. Category-Based Shopping**

- Dedicated category pages.
- Category-specific product displays.
- Reusable category sections.
- Product discovery through organized collections.
- Search and filtering functionality.

**4. Shopping Cart**

- Add products to the shopping cart.
- View selected products.
- Manage cart items.
- Remove individual products.
- Calculate the order subtotal.
- Apply eligible discounts and shipping charges.

**5. Favorites**

- Save preferred products.
- View favorite products separately.
- Manage the favorites collection.

**6. Customer Authentication**

The application supports passwordless authentication using OTP verification.

The intended authentication workflow is:

1. Customer selects email or phone authentication.
2. Customer enters their email address or phone number.
3. An OTP is requested.
4. The customer receives and enters the OTP.
5. The backend verifies the OTP.
6. Existing customers can log in.
7. New customers complete their required profile information before their account is created.

New customer profile information includes a name, with age and sex as optional fields.

Email OTP delivery uses Resend. Phone OTP delivery is designed for integration with MSG91.

**7. Customer Account**

- Customer account information.
- Access to account-related functionality.
- Order history and customer-specific information.

**8. Checkout**

- Review cart items.
- Calculate order totals.
- Apply eligible promotional pricing.
- Calculate shipping charges.
- Create orders through the backend.
- Initiate online payments.

**9. Order Management**

- Create customer orders.
- Maintain order information.
- Store individual order items.
- Associate orders with customers.
- Handle payment and order status.
- Prevent inappropriate repeat payment attempts.

**10. Payment Integration**

Razorpay is integrated to support online payments.

The payment workflow includes:

1. Create an order on the backend.
2. Generate a Razorpay payment order.
3. Open the payment checkout interface.
4. Process the customer's payment.
5. Verify payment information on the backend.
6. Update the corresponding order status.

Payment verification is handled server-side rather than trusting the frontend alone.

### B. Promotional Pricing System

The Plant Park includes custom promotional pricing rules.

| Pricing rule | Condition |
|---|---|
| Plant bundle offer | Any 4 eligible plants for ₹1,199 |
| Percentage discount | 10% discount when the eligible subtotal is strictly above ₹1,499, after bundle pricing |
| Shipping charge | ₹49 when the eligible order total is ₹499 or below |
| Free shipping | When the eligible order total is strictly above ₹499 |

The backend is responsible for calculating and validating order pricing to prevent customers from manipulating prices through frontend requests.

### C. Additional Pages

The application also includes:

- About Us
- Contact
- Login
- Account
- Favorites
- Cart
- Checkout
- Order Success

---

## 4. Technology Stack

### Frontend

| Technology | Purpose |
|---|---|
| React | Component-based user interface |
| Vite | Frontend development and build tooling |
| JavaScript | Application functionality |
| HTML5 | Webpage structure |
| CSS3 | Styling and responsive layouts |
| ESLint | Code quality and linting |

### Backend

| Technology | Purpose |
|---|---|
| Node.js | JavaScript runtime |
| Express.js | Backend framework and REST APIs |
| PostgreSQL | Relational database |
| node-postgres (pg) | PostgreSQL connectivity |
| bcryptjs | Password and credential hashing where applicable |
| JSON Web Token (JWT) | Authentication tokens |
| Resend | Email OTP delivery |
| Razorpay | Online payment integration |
| express-rate-limit | API rate limiting |
| Helmet | HTTP security headers |
| CORS | Cross-origin request configuration |
| dotenv | Environment variable management |

### Development and Deployment Tools

- Git and GitHub — version control and source-code management.
- Visual Studio Code — development environment.
- Postman / Thunder Client — API testing.
- pgAdmin — PostgreSQL database management.
- Vercel — frontend hosting.
- Render — backend hosting and PostgreSQL hosting.

---

## 5. System Architecture

The Plant Park follows a client-server architecture.

```text
             CUSTOMER
                 |
                 v
       REACT FRONTEND (VITE)
                 |
                 | HTTP / REST API
                 v
       NODE.JS + EXPRESS SERVER
                 |
       +---------+----------+
       |         |          |
       v         v          v
   PostgreSQL  Resend    Razorpay
   Database    Email     Payments
               Service
       |
       v
  CUSTOMER DATA
  PRODUCTS
  CART ITEMS
  FAVORITES
  ORDERS
  ORDER ITEMS
  AUTHENTICATION
```

### Frontend Responsibilities

The frontend handles:

- Displaying pages and product information.
- Navigation and user interactions.
- Shopping cart and favorites interfaces.
- Login and OTP verification screens.
- Checkout and payment interfaces.
- Communicating with backend APIs.
- Displaying loading states, errors, and success messages.

### Backend Responsibilities

The backend handles:

- REST API endpoints.
- Authentication and authorization.
- OTP generation and verification.
- Database operations.
- Product and category information.
- Cart and favorites management.
- Order creation and management.
- Pricing calculations.
- Payment order creation and verification.
- Inventory and order validation.
- Security and request validation.

### Database Responsibilities

PostgreSQL stores structured application information, including:

- Customer accounts.
- Product information.
- Product categories.
- Shopping cart items.
- Favorites.
- Orders.
- Order items.
- OTP verification records.

---

## 6. Database Design

The application uses PostgreSQL as its relational database.

The main database tables include:

| Table | Responsibility |
|---|---|
| `users` | Customer account information |
| `categories` | Product categories |
| `plants` | Plant and gardening product information |
| `cart_items` | Customer shopping cart |
| `favorites` | Customer favorite products |
| `orders` | Customer order records |
| `order_items` | Individual products associated with orders |
| `auth_verifications` | OTP verification and temporary authentication information |

The database uses relationships between customers, products, categories, carts, favorites, and orders to maintain data consistency.

Database migrations are used to introduce schema changes in a controlled and versioned manner.

---

## 7. API Structure

The backend exposes REST API endpoints grouped by functionality.

| API Route | Responsibility |
|---|---|
| `/api/health` | Backend and database health check |
| `/api/plants` | Product catalogue |
| `/api/categories` | Product categories |
| `/api/auth` | Authentication and OTP verification |
| `/api/cart` | Shopping cart operations |
| `/api/favorites` | Favorites management |
| `/api/orders` | Order operations |
| `/api/payments` | Payment processing and verification |

The API uses HTTP methods such as GET, POST, PUT, PATCH, and DELETE where appropriate.

Protected endpoints require valid authentication.

---

## 8. Security Implementation

Security is an important part of The Plant Park.

The application includes:

- Environment variables for sensitive configuration.
- JWT-based authentication.
- OTP hashing and expiration.
- Limited OTP verification attempts.
- Rate limiting for authentication endpoints.
- Server-side input validation.
- Server-side order and pricing validation.
- Razorpay payment verification.
- Helmet security headers.
- Restricted CORS configuration.
- JSON request size limits.
- PostgreSQL constraints and indexes.
- Protection against unauthorized customer-specific operations.

Sensitive information such as database credentials, JWT secrets, and payment secrets must never be committed to the public source code.

---

## 9. Installation and Local Setup

Follow these steps to run The Plant Park locally.

### Prerequisites

Install the following:

- Node.js (LTS recommended).
- npm.
- PostgreSQL.
- Git.
- Visual Studio Code (recommended).

### Step 1: Clone the Repository

```bash
git clone https://github.com/akshayjoshi252075-rgb/02_the_plant_park.git
```

```bash
cd 02_the_plant_park
```

### Step 2: Install Backend Dependencies

```bash
cd backend
npm install
```

### Step 3: Configure Backend Environment Variables

Create a `.env` file inside the `backend` directory.

Add the required configuration:

```env
PORT=5000

DB_HOST=localhost
DB_PORT=5432
DB_NAME=plant_park
DB_USER=postgres
DB_PASSWORD=your_database_password

JWT_SECRET=your_secure_jwt_secret

RESEND_API_KEY=your_resend_api_key

RAZORPAY_KEY_ID=your_razorpay_key_id
RAZORPAY_KEY_SECRET=your_razorpay_key_secret
```

Use the actual environment variable names required by the current backend configuration. Do not share real credentials.

### Step 4: Set Up PostgreSQL

1. Start PostgreSQL.
2. Create the required project database.
3. Configure database credentials.
4. Apply the project's database migrations in the documented order.
5. Load the required initial category and product data.

Never use the production database for local testing.

### Step 5: Start the Backend

From the `backend` directory:

```bash
npm run dev
```

The backend should start on the configured port.

Check the health endpoint:

```text
http://localhost:5000/api/health
```

### Step 6: Install Frontend Dependencies

Open another terminal:

```bash
cd frontend
npm install
```

### Step 7: Configure Frontend Environment Variables

Create a `.env` file inside the `frontend` directory:

```env
VITE_API_URL=http://localhost:5000/api
VITE_RAZORPAY_KEY_ID=your_razorpay_key_id
```

### Step 8: Start the Frontend

```bash
npm run dev
```

Vite normally starts the development server at:

```text
http://localhost:5173
```

Open the URL in your browser to access the application.

---

## 10. Testing and Code Quality

The project uses development checks to improve reliability.

### Frontend Linting

```bash
npm --prefix frontend run lint
```

### Frontend Production Build

```bash
npm --prefix frontend run build
```

### Backend Tests

From the project root:

```bash
npm --prefix backend test
```

These checks help identify frontend code-quality issues, build problems, and backend logic regressions.

Additional integration testing should cover authentication, cart operations, pricing calculations, order creation, inventory validation, and payment verification.

---

## 11. Deployment Architecture

The application is designed for separate frontend and backend deployment.

| Component | Hosting platform |
|---|---|
| Frontend | Vercel |
| Backend | Render |
| Database | PostgreSQL on Render |
| Email delivery | Resend |
| Payment gateway | Razorpay |

Production and testing environments should use separate configuration and database resources.

This separation helps prevent testing activities from modifying live customer information or production orders.

---

## 12. Project Structure

The repository follows a separated frontend and backend structure.

```text
02_the_plant_park/
│
├── backend/
│   ├── config/
│   ├── middleware/
│   ├── routes/
│   ├── scripts/
│   ├── tests/
│   ├── server.js
│   └── package.json
│
├── frontend/
│   ├── public/
│   │   ├── category-banners/
│   │   └── images/
│   │
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── services/
│   │   ├── App.jsx
│   │   └── App.css
│   │
│   └── package.json
│
├── Database/
│   ├── migrations/
│   └──
│
├── .gitignore
└── README.md
```

The exact directory contents may evolve as the application develops.

---

## 13. Future Enhancements

Potential future improvements include:

- Complete administrative dashboard and management workflows.
- Advanced product search and filtering.
- Product reviews and ratings.
- Wishlist enhancements.
- Order tracking and notifications.
- SMS OTP integration using MSG91.
- Improved inventory management.
- Product recommendation features.
- Gardening guides and educational content.
- Analytics and sales reports.
- Performance optimization and image compression.
- Progressive Web App (PWA) support.

---

## 14. Project Vision

The vision of The Plant Park is to create a convenient digital destination for plant lovers and gardening enthusiasts.

By combining an attractive shopping experience with reliable backend services, secure authentication, structured database management, and online payment functionality, the platform aims to make buying plants and gardening essentials easier.

The project also provides a foundation for future improvements in e-commerce automation, customer experience, inventory management, and intelligent product discovery.

---

## 15. Project Information

**Project Name:** The Plant Park

**Project Type:** Full-Stack E-commerce Web Application

**Domain:** Online Nursery, Plants and Gardening Products

**Frontend:** React + Vite

**Backend:** Node.js + Express.js

**Database:** PostgreSQL

**Authentication:** Passwordless OTP Authentication

**Payment Gateway:** Razorpay

**Email Service:** Resend

**Version Control:** Git and GitHub

**Repository:** [02_the_plant_park](https://github.com/stayhalalhabibi/02_the_plant_park)

---

## 16. Acknowledgement

The Plant Park is developed with the goal of combining technology, convenience, and the love of gardening into one accessible online platform.

Thank you for visiting The Plant Park repository! 🌿

**Grow More. Live Greener. Stay Connected with Nature.**
