// --- UTILITIES ---
const debounce = (func, delay = 300) => {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => {
            func.apply(this, args);
        }, delay);
    };
};

// --- STATE & RENDER ---
let products = [];
let allProducts = []; // To store the master list of all products
const productGrid = document.getElementById('product-grid');

// --- HEADER SCROLL EFFECT ---
const mainHeader = document.getElementById('main-header');
if (mainHeader) {
    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            mainHeader.classList.add('header-scrolled');
        } else {
            mainHeader.classList.remove('header-scrolled');
        }
    });
}

function saveProductsToStorage() {
    const cartState = products
        .filter(p => p.inCart) // This is fine as it's just for saving
        .map(({id, inCart, quantity}) => ({id, inCart, quantity}));
    localStorage.setItem('goshalaProducts', JSON.stringify(cartState));
}

const generateStars = (rating) => {
    let starsHTML = '';
    for (let i = 1; i <= 5; i++) starsHTML += `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-star ${i <= rating ? 'fill-yellow-400 stroke-yellow-500 text-yellow-500' : 'fill-stone-200 stroke-stone-300 text-stone-300'}"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;
    return starsHTML;
};

const getNewStatus = (dateString) => {
    if (!dateString) return null;
    const now = new Date();
    const productDate = new Date(dateString);
    if (productDate > now) return null;
    const diffTime = now - productDate;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays <= 15) return 'new';
    if (diffDays <= 30) return 'recent';
    return null;
};

const renderProducts = (productsToRender) => {
    if (productsToRender.length === 0) {
        productGrid.innerHTML = `<p class="col-span-full text-center text-stone-500 py-8">No products match your criteria.</p>`;
        return;
    }

    productGrid.innerHTML = ''; // Clear existing products
    productsToRender.forEach((product, index) => {
        const discount = product.originalPrice ? Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100) : 0;
        const card = document.createElement('li'); // Use <li> for semantic list item
        card.className = "product-card-new p-0 sm:p-4 md:p-6 rounded-lg flex flex-col"; // Added flex-col

        let cartControlsHTML = '';
        if (product.inCart) {
            cartControlsHTML = `
                <div class="w-full flex items-center justify-between font-bold text-lg rounded-lg bg-stone-100 border-2 border-stone-200">
                    <button class="quantity-change-btn text-green-700 px-4 py-2 rounded-l-md hover:bg-stone-200 active:bg-stone-300" data-product-id="${product.id}" data-change="-1">−</button>
                    <span class="text-stone-800 text-base">${product.quantity}</span>
                    <button class="quantity-change-btn text-green-700 px-4 py-2 rounded-r-md hover:bg-stone-200 active:bg-stone-300" data-product-id="${product.id}" data-change="1">+</button>
                </div>`;
        } else {
            cartControlsHTML = `<button class="add-to-cart-btn w-full font-bold text-sm py-2 px-4 rounded-lg transition-colors bg-green-600 text-white hover:bg-green-700 active:bg-green-800" data-product-id="${product.id}" aria-label="Add ${product.name} to cart">Add to Cart</button>`;
        }

        const imageUrl = (product.images && product.images.length > 0) ? product.images[0] : 'https://placehold.co/400x300/CCCCCC/FFFFFF?text=No+Image';

         card.innerHTML = `
            <div class="product-image-container relative group">
                <a href="product-detail.html?id=${product.id}" class="block overflow-hidden rounded-lg" aria-label="View details for ${product.name}">
                    <img src="${imageUrl}" alt="${product.name}" class="w-full aspect-square object-cover" loading="lazy" decoding="async">
                </a>
                <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-10">
