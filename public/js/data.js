// A constant for cache duration improves readability and maintainability.
const CACHE_DURATION_MS = 5000;

/**
 * Custom error for API-related failures.
 */
export class ApiError extends Error {
    constructor(message) { super(message); this.name = 'ApiError'; }
}

let cachedProducts = [];
let lastFetchTime = 0;
// Store the in-flight promise to prevent race conditions.
let inFlightFetch = null;

/**
 * Fetches products from the API and applies cart state from localStorage.
 * @param {boolean} forceReload - If true, bypasses the cache and fetches fresh data.
 * @returns {Promise<Array>} A promise that resolves to the array of products.
 */
export async function loadProducts(forceReload = false) {
    const now = Date.now();
    const isCacheValid = !forceReload && (now - lastFetchTime < CACHE_DURATION_MS) && cachedProducts.length > 0;

    if (isCacheValid) {
        // console.log("Returning products from cache.");
        return applyCartState(cachedProducts);
    }

    // If a fetch is already in progress, return the existing promise
    // to avoid redundant network requests.
    if (inFlightFetch) {
        // console.log("Returning in-flight product fetch promise.");
        // The raw products will be returned, so we still need to apply cart state.
        const products = await inFlightFetch;
        return applyCartState(products);
    }

    // console.log("Fetching products from API.");
    // The IIAFE (Immediately Invoked Async Function Expression) is assigned to inFlightFetch.
    inFlightFetch = (async () => {
        try {
            // Add timeout to prevent hanging
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

            // The API endpoint in server.js fetches all products, which is what we want for the cache.
            const response = await fetch('/api/products', { signal: controller.signal });
            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new ApiError(`Failed to fetch products. Status: ${response.status}`);
            }
            // The response from /api/products is { products: [...], hasMore: ... }
            const data = await response.json();
            const productsFromAPI = data.products || [];

            cachedProducts = productsFromAPI;
            lastFetchTime = Date.now();

            return productsFromAPI;
        } catch (error) {
            if (error.name === 'AbortError') {
                console.error("Fetch timed out after 10 seconds");
                throw new ApiError("Request timed out. Please check your connection.");
            }
            console.error("Could not fetch products:", error);
            // Re-throw the error so the UI layer can handle it and show a message.
            throw error;
        } finally {
            // Clear the in-flight promise once it's settled (resolved or rejected).
            inFlightFetch = null;
        }
    })();

    // Wait for the fetch to complete, then apply cart state.
    const products = await inFlightFetch;
    return applyCartState(products);
}

/**
 * Merges the cart state from localStorage into the products list.
 * @param {Array} products - The array of product objects from the API.
 * @returns {Array} The products array with 'inCart' and 'quantity' properties updated.
 */
function applyCartState(products) {
    // Use a default empty array to prevent errors if localStorage item is null.
    let cartMap = new Map();
    try {
        const storedCart = JSON.parse(localStorage.getItem('goshalaProducts')) || [];
        if (Array.isArray(storedCart)) {
            cartMap = new Map(storedCart.map(item => [item.id, item]));
        }
    } catch (error) {
        console.error("Failed to parse cart from localStorage:", error);
    }

    // Return a new array to avoid modifying the cache directly.
    return products.map(product => {
        const cartItem = cartMap.get(product.id);
        return {
            ...product,
            inCart: !!cartItem,
            quantity: cartItem?.quantity || 0,
        };
    });
}

/**
 * Fetches a single product by its ID from the API and applies cart state.
 * @param {number} productId - The legacy ID of the product.
 * @returns {Promise<object|null>} A promise that resolves to the product object or null if not found.
 */
export async function loadProductById(productId) {
    if (!productId) {
        throw new Error("Product ID is required to fetch a single product.");
    }
    try {
        const response = await fetch(`/api/products/${productId}`);
        if (response.status === 404) {
            return null; // Gracefully handle not found
        }
        if (!response.ok) {
            throw new ApiError(`Failed to fetch product ${productId}. Status: ${response.status}`);
        }
        const product = await response.json();
        // applyCartState expects an array, so we wrap the single product and then destructure the result.
        const [productWithCartState] = applyCartState([product]);
        return productWithCartState;
    } catch (error) {
        console.error(`Could not fetch product ${productId}:`, error);
        throw error;
    }
}

/**
 * Fetches all reviews for a specific product from the API.
 * @param {number} productId - The legacy ID of the product.
 * @returns {Promise<Array>} A promise that resolves to an array of review objects formatted for the frontend.
 */
export async function getReviewsForProduct(productId) {
    if (!productId) {
        throw new Error("Product ID is required to fetch reviews.");
    }
    try {
        const response = await fetch(`/api/comments/${productId}`);
        if (!response.ok) {
            throw new ApiError(`Failed to fetch reviews for product ${productId}. Status: ${response.status}`);
        }
        const reviews = await response.json();
        // Map backend fields to frontend-expected fields
        return reviews.map(review => ({
            id: review._id,
            author: review.username,
            comment: review.comment,
            rating: review.rating,
            date: review.createdAt,
            helpfulCount: 0, // Default value, as it's not stored in the backend
            verifiedPurchase: review.verifiedPurchase || false
        }));
    } catch (error) {
        console.error(`Could not fetch reviews for product ${productId}:`, error);
        throw error;
    }
}

/**
 * Submits a new review for a product to the API.
 * @param {number} productId - The legacy ID of the product.
 * @param {object} reviewData - The review data, containing { author, rating, comment }.
 * @returns {Promise<object>} A promise that resolves to the newly saved review object.
 */
export async function submitReview(productId, reviewData) {
    const response = await fetch(`/api/products/${productId}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user: reviewData.author, ...reviewData })
    });

    if (!response.ok) {
        const errorResult = await response.json();
        throw new ApiError(errorResult.error || 'Failed to submit review.');
    }
    const result = await response.json();
    // The backend returns { newComment, newRating, newReviewsCount }, we only need the comment part for instant display.
    const newComment = result.newComment;
    return {
        id: newComment._id,
        author: newComment.username,
        comment: newComment.comment,
        rating: newComment.rating,
        date: newComment.createdAt,
        helpfulCount: 0,
        verifiedPurchase: newComment.verifiedPurchase || false
    };
}