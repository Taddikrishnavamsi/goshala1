document.addEventListener('DOMContentLoaded', () => {
    const productNameEl = document.getElementById('product-name');
    const productPriceEl = document.getElementById('product-price');
    const productDescriptionEl = document.getElementById('product-description');
    const commentsListEl = document.getElementById('comments-list');
    const commentForm = document.getElementById('comment-form');
    const usernameInput = document.getElementById('username');
    const commentInput = document.getElementById('comment');
    const formStatusEl = document.getElementById('form-status');
    const submitButton = commentForm.querySelector('button[type="submit"]');

    let productId;

    /**
     * Fetches product and comment data from the server and renders it.
     */
    async function initializePage() {
        // In a real app, you'd get the ID from the URL, e.g., /product/123
        // For this example, we'll hardcode it after seeding the DB.
        // You can find the ID from the console log when you first run `node server.js`
        // Or you can use a URL like: product.html?id=YOUR_PRODUCT_ID
        const urlParams = new URLSearchParams(window.location.search);
        productId = urlParams.get('id');

        if (!productId) {
            document.body.innerHTML = '<div class="text-center p-8 text-red-600 font-bold">Error: No Product ID specified in the URL. <br> Please use a URL like: /product.html?id=YOUR_PRODUCT_ID</div>';
            return;
        }

        try {
            const response = await fetch(`/product/${productId}`);
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            renderProduct(data.product);
            renderComments(data.comments);
        } catch (error) {
            console.error('Failed to load product data:', error);
            productNameEl.textContent = 'Error';
            productDescriptionEl.textContent = `Could not load product data: ${error.message}`;
        }
    }

    /**
     * Renders the product details on the page.
     * @param {object} product - The product object.
     */
    function renderProduct(product) {
        productNameEl.textContent = product.name;
        productPriceEl.textContent = `₹${product.price.toFixed(2)}`;
        productDescriptionEl.textContent = product.description;
        document.title = `${product.name} - Details`;
    }

    /**
     * Renders a list of comments on the page.
     * @param {Array<object>} comments - An array of comment objects.
     */
    function renderComments(comments) {
        commentsListEl.innerHTML = ''; // Clear loading/existing comments
        if (comments.length === 0) {
            commentsListEl.innerHTML = '<p class="text-gray-500">No reviews yet. Be the first to leave one!</p>';
            return;
        }
        comments.forEach(comment => {
            const commentElement = createCommentElement(comment);
            commentsListEl.appendChild(commentElement);
        });
    }

    /**
     * Creates a DOM element for a single comment.
     * @param {object} comment - The comment object.
     * @returns {HTMLElement} The created div element for the comment.
     */
    function createCommentElement(comment) {
        const div = document.createElement('div');
        div.className = 'comment p-4';
        
        const usernameEl = document.createElement('p');
        usernameEl.className = 'font-bold text-gray-800';
        usernameEl.textContent = comment.username;

        const dateEl = document.createElement('p');
        dateEl.className = 'text-xs text-gray-500 mb-2';
        dateEl.textContent = new Date(comment.createdAt).toLocaleString();

        const commentTextEl = document.createElement('p');
        commentTextEl.className = 'text-gray-700';
        commentTextEl.textContent = comment.comment;

        div.appendChild(usernameEl);
        div.appendChild(dateEl);
        div.appendChild(commentTextEl);

        return div;
    }

    /**
     * Handles the comment form submission.
     */
    commentForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        formStatusEl.textContent = '';
        const username = usernameInput.value.trim();
        const comment = commentInput.value.trim();

        if (!username || !comment) {
            formStatusEl.textContent = 'Please fill in both your name and comment.';
            return;
        }

        submitButton.disabled = true;
        submitButton.textContent = 'Submitting...';

        try {
            const response = await fetch(`/product/${productId}/comment`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ username, comment }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || `Server error: ${response.status}`);
            }

            const newComment = await response.json();
            
            // If it's the first comment, clear the "No reviews yet" message
            if (commentsListEl.querySelector('p')) {
                commentsListEl.innerHTML = '';
            }

            const commentElement = createCommentElement(newComment);
            commentsListEl.prepend(commentElement); // Add new comment to the top

            // Reset form
            commentForm.reset();

        } catch (error) {
            console.error('Failed to submit comment:', error);
            formStatusEl.textContent = `Error: ${error.message}`;
        } finally {
            submitButton.disabled = false;
            submitButton.textContent = 'Submit Review';
        }
    });

    // --- Initial Load ---
    initializePage();
});