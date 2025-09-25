# Brundavanam Goshala E-Commerce Application Overview

This document provides a complete overview of the project's features, architecture, and how to run it. It's designed to be a reference for future development.

---

### High-Level Overview

The project is a fully functional e-commerce website for Brundavanam Goshala. It consists of:
1.  **A Frontend:** A set of user-facing HTML pages (`index.html`, `cart.html`, etc.) styled with Tailwind CSS that customers interact with.
2.  **A Backend:** A Node.js server (`server.js`) that serves the pages, provides product data, and handles order processing.
3.  **A File-Based Database:** Two JSON files (`products.json` and `orders.json`) that act as your database for products and customer orders.

---

### Backend: The Engine (`server.js`)

Your `server.js` file is the heart of the application. It's responsible for all the "behind-the-scenes" work.

*   **Serves the Website:** It acts as a web server, sending your HTML, CSS, and JavaScript files to the user's browser when they visit `http://localhost:3000`.
*   **Product API (`/api/products`):** When a page needs to display products, it asks this endpoint. The server reads `products.json` and sends the full list of products back.
*   **Review Submission API (`/api/products/:id/reviews`):** When a user submits a review on a product detail page, the data is sent here. The server finds the correct product, adds the new review, recalculates the average rating, and saves the changes back to `products.json`.
*   **Order Processing API (`/api/orders`):** This is the most critical backend feature. When a user places an order from the `checkout.html` page, all the details (customer info and items) are sent here. The server:
    1.  Generates a unique `orderId`.
    2.  Reads the existing `orders.json` file.
    3.  Adds the new order to the top of the list.
    4.  Saves the updated list back to `orders.json`.
    5.  Sends the `orderId` back to the user, who is then redirected to the confirmation page.
*   **Secure Admin API (`/api/admin/orders`):** This endpoint is for your private `admin.html` page. It requires a secret key (`goshala_admin_123`) to be passed as a query parameter. If the key is correct, it reads and returns all the orders from `orders.json`. If not, it denies access.

---

### Data Files: Your "Database"

*   **`products.json`:** This file stores an array of all your product objects. Each product has an `id`, `name`, `price`, `description`, `images`, `category`, `reviews`, etc. This is where you would manually add or edit product information.
*   **`orders.json`:** This file is automatically created and updated by your server. It stores an array of all customer orders. Each order object contains:
    *   `orderId`: The unique ID for the order.
    *   `date`: When the order was placed.
    *   `user`: An object with the customer's `firstname`, `lastname`, `email`, `phone`, and full `address`.
    *   `total`: The total cost of the order.
    *   `items`: An array of the products that were purchased.

---

### Frontend: The User Experience

#### Core JavaScript Logic (`js/data.js`)

*   **`loadProducts()`:** This is the most important function on the frontend. It fetches the product list from your server's `/api/products` endpoint. It then cleverly merges this master list with the user's personal shopping cart information, which is stored in their browser's `localStorage`. This ensures that when a user sees a product, the page knows if it's already in their cart and what the quantity is.

#### Main Pages & Their Features

*   **`index.html` (Homepage / Shop):**
    *   **Product Grid:** Displays all your products in an attractive grid.
    *   **Filtering & Sorting:** Users can filter products by category and sort them by relevance, price, or date.
    *   **Live Search:** A search bar provides instant suggestions as the user types.
    *   **"Load More" Button:** Instead of showing all products at once, it loads them in batches for better performance.
    *   **Quick View Modal:** Users can click a "Quick View" button on a product to see a summary in a pop-up window without leaving the page.
    *   **Advertisement Carousel:** A rotating banner at the top to feature key products or promotions.

*   **`cart.html` (Shopping Cart):**
    *   Lists all items the user has added to their cart.
    *   Users can easily increase/decrease the quantity of items or remove them completely.
    *   The order summary and total price update automatically.
    *   The "Proceed to Checkout" button takes the user to the dedicated checkout page.

*   **`checkout.html` (Checkout Page):**
    *   A professional, multi-step inspired form to collect customer shipping details.
    *   Fields for name, email, phone, and a full written address.
    *   **Google Maps Integration:** Includes a search bar that can autocomplete addresses (requires a Google API key to be fully functional). It also has a button to use the device's current location.
    *   **Form Validation:** Checks that all required fields are filled before allowing an order to be placed.
    *   Saves the user's details in their browser's `localStorage` so the form is pre-filled on their next visit.

*   **`product-detail.html` (Product Page):**
    *   Displays all information for a single product.
    *   Features an image gallery with clickable thumbnails.
    *   **Persistent Reviews:** Users can read existing reviews and submit their own. These reviews are permanently saved to `products.json` via the backend.
    *   Shows a "You Might Also Like" section with related products.

*   **`order-confirmation.html` (Thank You Page):**
    *   The final page in the checkout flow.
    *   Confirms that the order was successful and displays the unique `orderId` to the customer.

*   **`admin.html` (Private Admin Dashboard):**
    *   **This page is not linked anywhere on the public site.** You access it by manually going to `http://localhost:3000/admin.html`.
    *   It will prompt you for the secret key (`goshala_admin_123`).
    *   If the key is correct, it displays a dashboard with a table of all orders from `orders.json`.
    *   The table shows the Order ID, date, customer name, email, phone, full address, order total, and the items purchased.
    *   It also shows summary cards for Total Revenue and Total Orders.

*   **`about.html` & `contact.html` (Static Pages):**
    *   `about.html` provides information about the Goshala.
    *   `contact.html` has your contact details and a fully functional contact form that sends messages to your email via the Formspree service.

---

### How to Run the Application

1.  Open a terminal in your project folder (`c:\Users\Taddi\Desktop\goshala`).
2.  Run the command: `node server.js`.
3.  Open your browser and go to `http://localhost:3000`.
4.  To see your orders, go to `http://localhost:3000/admin.html` and enter the password when prompted.