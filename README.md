# Brundavanam Goshala E-Commerce Application Overview

This document provides a complete overview of the project's features, architecture, and how to run it. It's designed to be a reference for future development.

---

### High-Level Overview

The project is a fully functional e-commerce website for Brundavanam Goshala. It consists of:
1.  **A Frontend:** A set of user-facing HTML pages (`index.html`, `cart.html`, etc.) styled with Tailwind CSS that customers interact with.
2.  **A Backend:** A Node.js and Express server (`server.js`) that serves the pages, provides a rich API for products and orders, and handles all business logic.
3.  **A Database:** The application uses MongoDB as its database, managed through Mongoose schemas for robust data modeling and validation.

---

### Backend: The Engine (`server.js`)

Your `server.js` file is the heart of the application. It's responsible for all the "behind-the-scenes" work.

*   **Serves the Website:** It acts as a web server, sending your HTML, CSS, and JavaScript files to the user's browser when they visit `http://localhost:3000`.
*   **Product API (`/api/products`):** A powerful endpoint that serves products from the MongoDB database. It supports:
    *   **Pagination:** Using `offset` and `limit` query parameters for features like infinite scroll.
    *   **Sorting:** By `newest`, `price-asc`, and `price-desc`.
    *   **Filtering:** By `category`.
    *   **Searching:** Via a `q` parameter to search product names and descriptions.
*   **Single Product API (`/api/products/:id`):** Fetches a single product by its unique MongoDB `_id`.
*   **Review Submission API (`/api/products/:id/reviews`):** When a user submits a review, the data is sent here. The server saves the review to a dedicated `Comment` collection, checks if it's a "Verified Purchase" by cross-referencing with past orders, and updates the product's average rating.
*   **Comments API (`/api/comments/:productId`):** Fetches all comments for a given product, with support for sorting and filtering by star rating.
*   **Order Processing API (`/api/orders`):** When a user places an order from `checkout.html`, the details are sent here. The server generates a unique `orderId` and saves the complete order to the `Order` collection in MongoDB.
*   **Secure Admin APIs:**
    *   **`/api/admin/orders`:** A secure endpoint for the `admin.html` page. It requires a secret key and returns a list of all orders, with support for searching.
    *   **`/api/admin/orders/export`:** Allows an authenticated admin to download the current order list as a CSV file.
    *   **Product Management (CRUD):** A full suite of secure endpoints (`/api/products`) for creating, reading, updating, and deleting products from the `admin-products.html` dashboard.
    *   **Image Uploads (`/api/upload`):** A secure endpoint using `multer` to handle image uploads for products, saving them to the server and returning a URL.

---

### Data Model: MongoDB & Mongoose

The application uses MongoDB for its database, with Mongoose schemas defining the structure for `Product`, `Comment`, and `Order` collections.

*   **`Product` Schema:** Defines the structure for each product, including name, price, images, categories, description, and rating information.
*   **`Comment` Schema:** Stores individual reviews, linked to a product. It includes the user's name, their rating, the comment text, and a `verifiedPurchase` flag.
*   **`Order` Schema:** Contains all information for a customer's order, including a unique `orderId`, date, user details, total amount, and a list of items purchased.
*   **Data Migration:** On first run, the server automatically migrates product data from the legacy `products.json` file into the MongoDB database. This file is now only used for this initial seeding process.

---

### Frontend: The User Experience

#### Core JavaScript Logic (`js/data.js`)

*   **`loadProducts()`:** This function is used by pages like the Cart and Product Detail page to fetch the *entire* product catalog from the backend. It then merges this master list with the user's shopping cart information (stored in `localStorage`) to determine which items are in the cart and their quantities.

#### Main Pages & Their Features

*   **`index.html` (Homepage / Shop):**
    *   **Product Grid:** Displays all your products in an attractive grid.
    *   **Backend-Driven Infinite Scroll:** Instead of a "Load More" button, products are now fetched from the backend in pages as the user scrolls, providing a seamless experience and faster initial load times.
    *   **Filtering & Sorting:** Users can filter products by category and sort them by relevance, price, or date. These actions now trigger new API calls to the backend to get a freshly sorted/filtered list.
    *   **Live Search:** A search bar provides instant suggestions as the user types.
    *   **Quick View Modal:** Users can click a "Quick View" button on a product to see a summary in a pop-up window without leaving the page.
    *   **Advertisement Carousel:** A rotating banner at the top to feature key products or promotions.

*   **`cart.html` (Shopping Cart):**
    *   Lists all items the user has added to their cart.
    *   Users can easily increase/decrease the quantity of items or remove them completely.
    *   The order summary and total price update automatically.
    *   Includes a "You Might Also Like" section with products related to items in the cart.

*   **`checkout.html` (Checkout Page):**
    *   A professional, multi-step inspired form to collect customer shipping details.
    *   **Google Maps Integration:** Includes an address search bar that can autocomplete addresses and a button to use the device's current location (requires a Google Maps API key).
    *   **Form Validation:** Checks that all required fields are filled before allowing an order to be placed.
    *   Saves the user's details in their browser's `localStorage` so the form is pre-filled on their next visit.

*   **`product-detail.html` (Product Page):**
    *   Displays all information for a single product.
    *   Features an image gallery with clickable thumbnails.
    *   **Advanced Review System:**
        *   Users can read existing reviews and submit their own, which are saved permanently to the database.
        *   Displays a "Verified Purchase" badge on reviews from actual customers.
        *   Includes a detailed review summary with a star rating breakdown.
        *   Allows users to filter reviews by star rating and sort them by newest, oldest, highest, or lowest rating.
    *   Shows a "You Might Also Like" section with related products.

*   **`order-confirmation.html` (Thank You Page):**
    *   The final page in the checkout flow.
    *   Confirms that the order was successful and displays the unique `orderId` to the customer.

*   **`admin.html` (Admin Order Dashboard):**
    *   **This page is not linked anywhere on the public site.** You access it by manually going to `http://localhost:3000/admin.html`.
    *   It will prompt you for the secret key (`goshala_admin_123`).
    *   If the key is correct, it displays a dashboard with a searchable table of all orders from the database.
    *   Shows summary cards for Total Revenue and Total Orders.
    *   Includes an "Export to CSV" button to download order data.

*   **`admin-products.html` (Admin Product Management):**
    *   A secure page for managing the product catalog.
    *   Displays all products in a table.
    *   Allows the admin to **Create**, **Edit**, and **Delete** products via a user-friendly modal form.
    *   Includes an image uploader that sends images to the backend and displays previews.

*   **`about.html` & `contact.html` (Static Pages):**
    *   `about.html` provides information about the Goshala.
    *   `contact.html` has your contact details and a fully functional contact form that sends messages to your email via the Formspree service.

---

### How to Run the Application

1.  **Set up Environment:** Create a `.env` file in the root directory and add your MongoDB connection string: `MONGO_URI="your_mongodb_connection_string"`
1.  Open a terminal in your project folder (`c:\Users\Taddi\Desktop\goshala`).
3.  Run the command: `node server.js`.
4.  Open your browser and go to `http://localhost:3000`.
5.  To see your orders, go to `http://localhost:3000/admin.html` and enter the password when prompted.
