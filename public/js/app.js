/**
 * Updates the cart count in the header.
 */
export function updateCartCount() {
    const cartCountElement = document.getElementById('cart-count');
    if (!cartCountElement) return;

    const storedProducts = JSON.parse(localStorage.getItem('goshalaProducts')) || [];
    const itemsInCart = storedProducts.filter(p => p.inCart).length;
    const currentCount = parseInt(cartCountElement.textContent);

    if (itemsInCart !== currentCount) {
        cartCountElement.textContent = itemsInCart;
        cartCountElement.classList.add('cart-count-animate');
        cartCountElement.addEventListener('animationend', () => cartCountElement.classList.remove('cart-count-animate'), { once: true });
    }
}