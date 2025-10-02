# Analysis of `product-detail.html`

This document explains the data flow, connections, and key file paths related to the `product-detail.html` page in the Brundavanam Goshala application.

---

## 1. Data Flow: Where Information Comes From and Goes

The product detail page is highly dynamic and interacts with both the backend server and the browser's local storage.

### Data Fetching (Getting Information)

When you open `product-detail.html?id=5`, the following happens to display the product and its reviews:

1.  **Product Details (Name, Price, Images, etc.)**
    *   **Path:** `product-detail.html` -> `public/js/data.js` -> `server.js` -> MongoDB
    *   **Process:**
        1.  The page's JavaScript first gets the product ID from the URL (e.g., `5`).
        2.  It calls the `loadProductById(productId)` function from `public/js/data.js`.
        3.  `loadProductById()` makes a direct API call to the specific endpoint `/api/products/:id` (e.g., `/api/products/5`).
        4.  The `server.js` file handles this request, finds the single product with the matching `legacyId` in the MongoDB `Product` collection, and sends it back.
        5.  The page receives the single product object and displays its details.

2.  **Customer Reviews (Ratings and Comments)**
    *   **Path:** `product-detail.html` -> `public/js/data.js` -> `server.js` -> MongoDB
    *   **Process:**
        1.  After loading the product, the page calls the `getReviewsForProduct(productId)` function from `public/js/data.js`.
        2.  This function makes an API call to the backend endpoint `/api/comments/:productId` (e.g., `/api/comments/5`).
        3.  The `server.js` file finds all comments in the MongoDB `Comment` collection that match the product's ID.
        4.  The reviews are sent back to the page and displayed in the "Customer Reviews" section.

### Data Sending (Submitting Information)

The page also sends data back to the server or saves it in the browser.

1.  **Submitting a New Review**
    *   **Path:** `product-detail.html` (Form) -> `public/js/data.js` -> `server.js` -> MongoDB
    *   **Process:**
        1.  When a user fills out the review form and clicks "Submit Review", the page's JavaScript captures the data (name, rating, comment).
        2.  It calls the `submitReview(productId, reviewData)` function from `public/js/data.js`.
        3.  This function sends the data via a `POST` request to the backend endpoint `/api/products/:id/reviews`.
        4.  `server.js` receives the review, saves it to the MongoDB `Comment` collection, and updates the product's overall rating in the `Product` collection.

2.  **Adding an Item to the Cart**
    *   **Path:** `product-detail.html` -> Browser's `localStorage`
    *   **Process:**
        1.  When a user clicks "Add to Cart" or changes the quantity, the JavaScript on `product-detail.html` updates the product's state in its memory.
        2.  It then calls `saveProductsToStorage()`, which saves the current cart status (a list of product IDs and their quantities) into the browser's `localStorage` under the key `goshalaProducts`.
        3.  This `localStorage` item is shared across all pages of your website, ensuring the cart is consistent everywhere.

---

## 2. Page & System Connections

The product detail page is tightly integrated with the rest of the site.

*   **`index.html` (Homepage):**
    *   This is the primary entry point. Clicking on any product card on the homepage navigates the user to `product-detail.html?id=<PRODUCT_ID>`.

*   **`cart.html` (Shopping Cart):**
    *   Actions on the product detail page (like "Add to Cart") directly affect what is shown on the cart page because they both read from the same `localStorage` (`goshalaProducts`).
    *   The cart icon in the header, visible on all pages, also updates its count based on this shared `localStorage` data.

*   **`public/js/data.js` (Client-Side Data Module):**
    *   This is the central hub for all frontend data operations. `product-detail.html` relies on it for fetching products/reviews and submitting new reviews. This keeps the data logic separate from the display logic.

*   **`server.js` (Backend Server):**
    *   This is the ultimate source of truth for all product and review data. The product detail page cannot function without fetching data from the API endpoints provided by `server.js`.

*   **Browser `localStorage` and `storage` event:**
    *   This is the key to a seamless multi-tab experience. If you have the homepage open in one tab and add a product to the cart from the detail page in another tab, the homepage's cart icon will update automatically because it's listening for `storage` events.

*   **Other Static Pages (`about.html`, `contact.html`):**
    *   The connection is primarily through the shared, consistent header and footer, allowing for seamless navigation across the entire site.

---