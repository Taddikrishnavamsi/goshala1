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
            // The API endpoint in server.js fetches all products, which is what we want for the cache.
            const response = await fetch('/api/products');
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
    const storedCart = JSON.parse(localStorage.getItem('goshalaProducts')) || [];
    const cartMap = new Map(storedCart.map(item => [item.id, item]));

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