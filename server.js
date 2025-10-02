require('dotenv').config(); // Load environment variables from .env file
const express = require('express');
const fs = require('fs').promises;
const multer = require('multer');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const { put } = require('@vercel/blob');


const app = express();
const PORT = process.env.PORT || 3000;

const ADMIN_SECRET = process.env.ADMIN_SECRET || 'goshala_admin_123';

// Middleware for admin authentication
const adminAuth = (req, res, next) => {
    const secret = req.headers['x-admin-secret'] || req.query.secret;
    if (secret !== ADMIN_SECRET) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
};

// Middleware for user authentication (simple email-based)
const userAuth = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer <token>
    if (token == null) return res.sendStatus(401);

    // In this simple setup, the token is the user's email.
    req.userEmail = token;
    next();
};

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// --- Multer Configuration for Image Uploads (in-memory) ---
const upload = multer({ 
    storage: multer.memoryStorage(), // Use memory storage to handle the file as a buffer
    fileFilter: (req, file, cb) => {
        if (!file.mimetype.startsWith('image/')) return cb(new Error('Only image files are allowed!'), false);
        cb(null, true);
    }
});

// --- Middleware ---
app.use(cors());
app.use(express.json());
// Serve all static files (HTML, CSS, client-side JS, images) from the 'public' directory.
app.use(express.static('public'));

// --- MongoDB Connection ---
// Connection string is now loaded from the .env file
const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error('FATAL ERROR: MONGO_URI is not defined in the .env file.');
  process.exit(1); // Exit if the database connection string is not found
}

// --- Mongoose Schemas and Models ---
const ProductSchema = new mongoose.Schema({
  legacyId: { type: Number, required: true, unique: true, index: true },
  name: { 
    type: String, 
    required: [true, 'Product name is required.'], 
    trim: true,
    minlength: 3,
    maxlength: 150
  },
  dateAdded: { type: Date, default: Date.now },
  category: [String],
  images: [String],
  description: { type: String, trim: true, maxlength: 2000 },
  rating: { type: Number, default: 0 },
  reviewsCount: { type: Number, default: 0 },
  sellerTag: { type: String },
  price: { 
    type: Number, 
    required: [true, 'Product price is required.'],
    min: 0 
  },
  originalPrice: { type: Number },
  deliveryDate: { type: String }
});
const Product = mongoose.model('Product', ProductSchema);

const CommentSchema = new mongoose.Schema({
  productId: { type: Number, required: true, index: true },
  username: { type: String, required: true, trim: true },
  comment: { type: String, required: true, trim: true },
  rating: { type: Number, min: 1, max: 5 },
  createdAt: { type: Date, default: Date.now },
  verifiedPurchase: { type: Boolean, default: false }
});
const Comment = mongoose.model('Comment', CommentSchema);

const OrderSchema = new mongoose.Schema({
  orderId: { type: String, required: true, unique: true },
  date: { type: Date, default: Date.now },
  user: {
    // userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Future enhancement
    firstname: { type: String, required: true, trim: true },
    lastname: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, match: [/.+@.+\..+/, 'Please enter a valid email address'] },
    phone: { type: String, required: true, trim: true },
    address1: { type: String, required: true, trim: true },
    address2: { type: String, trim: true },
    city: { type: String, required: true, trim: true },
    state: { type: String, required: true, trim: true },
    zip: { type: String, required: true, trim: true }
  },
  total: { type: Number, required: true, min: 0 },
  items: {
    type: [{
        id: { type: Number, required: true },
        name: { type: String, required: true },
        quantity: { type: Number, required: true, min: 1 },
        price: { type: Number, required: true, min: 0 }
    }],
    required: true,
    validate: [
        { validator: (val) => val.length > 0, msg: 'Order must have at least one item.' }
    ]
  },
  paymentStatus: { type: String, default: 'pending' },
  razorpay: {
    orderId: String,
    paymentId: String,
    signature: String
  },
  shippingStatus: {
    type: String,
    enum: ['Pending', 'Shipped', 'Delivered', 'Cancelled'],
    default: 'Pending',
    required: true
  }
});
const Order = mongoose.model('Order', OrderSchema);

const ConfigSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, index: true },
  value: mongoose.Schema.Types.Mixed
});
const Config = mongoose.model('Config', ConfigSchema);

// --- Main API Endpoints ---

app.get('/api/products', async (req, res) => {
    try {
        const { sort = 'relevance', category: categoryQuery, page = 1, limit = 10, search } = req.query;

        let query = {};

        if (categoryQuery && categoryQuery !== 'All') {
            query.category = categoryQuery;
        }

        if (search) {
            const searchRegex = { $regex: search, $options: 'i' };
            const searchNumber = parseInt(search);
            query.$or = [
                { name: searchRegex },
                ...(isNaN(searchNumber) ? [] : [{ legacyId: searchNumber }])
            ];
        }

        let sortOptions = {};
        if (sort === 'newest') { sortOptions = { dateAdded: -1 }; }
        else if (sort === 'price-asc') { sortOptions = { price: 1 }; }
        else if (sort === 'price-desc') { sortOptions = { price: -1 }; }
        else { sortOptions = { legacyId: 1 }; } // Default sort for admin

        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const skip = (pageNum - 1) * limitNum;

        const totalProducts = await Product.countDocuments(query);
        const totalPages = Math.ceil(totalProducts / limitNum);

        const productsFromDB = await Product.find(query)
            .sort(sortOptions)
            .skip(skip)
            .limit(limitNum)
            .lean();

        const formattedProducts = (productsFromDB || []).map(product => {
            const productObj = { ...product };
            productObj.id = productObj.legacyId; // Add the numeric id for frontend compatibility
            delete productObj.legacyId;
            delete productObj.__v;
            delete productObj._id;
            return productObj;
        });

        res.json({
            products: formattedProducts,
            totalPages: totalPages,
            currentPage: pageNum,
            totalProducts: totalProducts
        });
    } catch (error) {
        console.error('Error fetching products from DB:', error);
        res.status(500).json({ error: 'Failed to fetch products' });
    }
});

app.get('/api/products/:id', async (req, res) => {
    try {
        const product = await Product.findOne({ legacyId: parseInt(req.params.id) });
        if (!product) {
            return res.status(404).json({ error: 'Product not found.' });
        }

        const productObj = product.toObject();
        productObj.id = productObj.legacyId;
        delete productObj.legacyId;
        delete productObj.__v;
        
        res.json(productObj);
    } catch (error) {
        console.error('Error fetching single product:', error);
        res.status(500).json({ error: 'Failed to fetch product.' });
    }
});

app.post('/api/upload', adminAuth, upload.single('image'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded.' });
    }

    try {
        const filename = `${Date.now()}-${req.file.originalname}`;
        // Upload the file buffer to Vercel Blob
        const blob = await put(filename, req.file.buffer, {
          access: 'public', // Make the file publicly accessible
        });
        res.status(201).json({ url: blob.url }); // Return the permanent URL
    } catch (error) {
        console.error('Error uploading to Vercel Blob:', error);
        res.status(500).json({ error: 'Failed to upload image.' });
    }
}, (error, req, res, next) => {
    // Multer error handler
    res.status(400).json({ error: error.message });
});

app.post('/api/products', adminAuth, async (req, res) => {
    try {
        const productData = { ...req.body };
        delete productData._id; // Ensure we don't pass an invalid _id
        delete productData.id;

        const newProduct = new Product({
            ...productData,
            legacyId: productData.legacyId, // Use the provided legacyId
            dateAdded: new Date()
        });
        await newProduct.save();
        
        const productObj = newProduct.toObject();
        productObj.id = productObj.legacyId;
        delete productObj.legacyId;
        delete productObj.__v;
        
        res.status(201).json(productObj);
    } catch (error) {
        console.error('Error creating product:', error);
        res.status(400).json({ error: 'Failed to create product.', details: error.message });
    }
});

app.put('/api/products/:id', adminAuth, async (req, res) => {
    try {
        const updatedProduct = await Product.findOneAndUpdate(
            { legacyId: parseInt(req.params.id) }, 
            req.body, 
            { new: true, runValidators: true }
        );
        if (!updatedProduct) {
            return res.status(404).json({ error: 'Product not found.' });
        }
        
        const productObj = updatedProduct.toObject();
        productObj.id = productObj.legacyId;
        delete productObj.legacyId;
        delete productObj.__v;
        
        res.json(productObj);
    } catch (error) {
        console.error('Error updating product:', error);
        res.status(400).json({ error: 'Failed to update product.', details: error.message });
    }
});

app.delete('/api/products/:id', adminAuth, async (req, res) => {
    try {
        const deletedProduct = await Product.findOneAndDelete({ legacyId: parseInt(req.params.id) });
        if (!deletedProduct) return res.status(404).json({ error: 'Product not found.' });
        res.status(200).json({ message: 'Product deleted successfully.' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete product.' });
    }
});

app.get('/api/comments/:productId', async (req, res) => {
    try {
        const { productId: legacyId } = req.params;
        const sort = req.query.sort || 'newest';
        const stars = req.query.stars; // e.g., "5,4"
        
        const query = { productId: parseInt(legacyId) };
        if (stars) {
            const starFilters = stars.split(',').map(Number).filter(n => n >= 1 && n <= 5);
            if (starFilters.length > 0) {
                query.rating = { $in: starFilters };
            }
        }

        // Build the sort object
        let sortOptions = { createdAt: -1 }; // Default: newest
        if (sort === 'oldest') sortOptions = { createdAt: 1 };
        else if (sort === 'highest') sortOptions = { rating: -1, createdAt: -1 };
        else if (sort === 'lowest') sortOptions = { rating: 1, createdAt: -1 };

        // Fetch all comments that match the query, without pagination
        const comments = await Comment.find(query)
            .sort(sortOptions);
        
        res.json(comments);
    } catch (error) {
        console.error('Error fetching comments:', error);
        res.status(500).json({ message: 'Server error while fetching comments.' });
    }
});

app.post('/api/products/:id/reviews', async (req, res) => {
    const productId = req.params.id;
    try {
        const product = await Product.findOne({ legacyId: parseInt(productId) });
        if (!product) {
            return res.status(404).json({ error: `Product with ID ${productId} not found.` });
        }

        // --- Verification Logic ---
        const { user, rating, comment } = req.body;
        if (!user || !rating || !comment || rating < 1 || rating > 5) {
            return res.status(400).json({ error: 'Missing required review fields: user, rating, comment' });
        }

        let isVerified = false;
        // Find orders that contain this product's legacyId
        const ordersWithProduct = await Order.find({ 'items.id': product.legacyId, });
        // Check if any of those orders were placed by a user with a matching name
        if (ordersWithProduct.length > 0) {
            const reviewerName = user.toLowerCase().trim();
            isVerified = ordersWithProduct.some(order => {
                const customerName = `${order.user.firstname || ''} ${order.user.lastname || ''}`.toLowerCase().trim();
                // Check if the reviewer's name is part of the customer's full name
                return customerName.includes(reviewerName);
            });
        }
        // --- End Verification Logic ---

        const newComment = new Comment({
            productId: product.legacyId, // Use the numeric legacyId
            username: user,
            rating: parseInt(rating),
            comment: comment,
            verifiedPurchase: isVerified
        });
        await newComment.save();

        const stats = await Comment.aggregate([
            { $match: { productId: product.legacyId } },
            { $group: { _id: '$productId', avgRating: { $avg: '$rating' }, count: { $sum: 1 } } }
        ]);

        if (stats.length > 0) {
            product.rating = Math.round(stats[0].avgRating * 10) / 10; // Keep decimal for accuracy
            product.reviewsCount = stats[0].count;
            await product.save();
        }

        res.status(201).json({
            newComment,
            newRating: product.rating,
            newReviewsCount: product.reviewsCount
        });
    } catch (error) {
        console.error('Error adding review to DB:', error);
        res.status(500).json({ error: 'Failed to add review.' });
    }
});

// --- Config Endpoints (for homepage carousel and top picks) ---

// GET the list of product IDs for the carousel
app.get('/api/admin/config/carousel', adminAuth, async (req, res) => {
    const config = await Config.findOne({ key: 'carouselProductIds' });
    res.json(config ? config.value : []);
});

// SET the list of product IDs for the carousel
app.put('/api/admin/config/carousel', adminAuth, async (req, res) => {
    const { productIds } = req.body;
    await Config.findOneAndUpdate(
        { key: 'carouselProductIds' },
        { value: productIds },
        { upsert: true, new: true }
    );
    res.status(200).json({ success: true });
});

// GET the list of product IDs for top picks
app.get('/api/admin/config/top-picks', adminAuth, async (req, res) => {
    const config = await Config.findOne({ key: 'topPicksProductIds' });
    res.json(config ? config.value : []);
});

// SET the list of product IDs for top picks
app.put('/api/admin/config/top-picks', adminAuth, async (req, res) => {
    const { productIds } = req.body;
    await Config.findOneAndUpdate(
        { key: 'topPicksProductIds' },
        { value: productIds },
        { upsert: true, new: true }
    );
    res.status(200).json({ success: true });
});

// PUBLIC: Get the full product data for the carousel slides
app.get('/api/config/carousel-slides', async (req, res) => {
    const config = await Config.findOne({ key: 'carouselProductIds' });
    if (!config || !config.value || config.value.length === 0) {
        return res.json([]);
    }
    const products = await Product.find({ legacyId: { $in: config.value } }).lean();
    // Sort products to match the order in the config
    const sortedProducts = config.value.map(id => products.find(p => p.legacyId === id)).filter(Boolean);
    res.json(sortedProducts);
});

// PUBLIC: Get the full product data for top picks
app.get('/api/config/top-picks-products', async (req, res) => {
    const config = await Config.findOne({ key: 'topPicksProductIds' });
    if (!config || !config.value || config.value.length === 0) {
        return res.json([]);
    }
    const products = await Product.find({ legacyId: { $in: config.value } }).lean();
    const sortedProducts = config.value.map(id => products.find(p => p.legacyId === id)).filter(Boolean);
    res.json(sortedProducts);
});

// --- Order and Admin Endpoints ---
app.get('/api/admin/orders', adminAuth, async (req, res) => {
    try {
        const { search, page = 1, limit = 10 } = req.query;
        let query = {};

        if (search) {
            const searchRegex = { $regex: search, $options: 'i' }; // i for case-insensitive
            query.$or = [
                { orderId: searchRegex },
                { 'user.firstname': searchRegex },
                { 'user.lastname': searchRegex },
                { 'user.email': searchRegex }
            ];
        }

        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const skip = (pageNum - 1) * limitNum;

        const totalOrders = await Order.countDocuments(query);
        const totalPages = Math.ceil(totalOrders / limitNum);

        const orders = await Order.find(query).sort({ date: -1 }).skip(skip).limit(limitNum).lean();
        res.json({
            orders,
            totalPages,
            currentPage: pageNum
        });
    } catch (error) {
        console.error('Error fetching orders from DB:', error);
        res.status(500).json({ error: 'Failed to read orders data.' });
    }
});

app.get('/api/admin/orders/export', adminAuth, async (req, res) => {
    try {
        const { search } = req.query;
        const query = {};

        if (search) {
            const searchRegex = { $regex: search, $options: 'i' };
            query.$or = [
                { orderId: searchRegex },
                { 'user.firstname': searchRegex },
                { 'user.lastname': searchRegex },
                { 'user.email': searchRegex }
            ];
        }

        const orders = await Order.find(query).sort({ date: -1 }).lean();

        if (orders.length === 0) {
            return res.status(404).send('No orders to export.');
        }

        const headers = ['OrderID', 'Date', 'CustomerName', 'Email', 'Phone', 'Address', 'Total', 'Items'];
        
        // Helper to escape CSV cells
        const escapeCsvCell = (cell) => {
            if (cell === null || cell === undefined) return '';
            let str = String(cell);
            if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
        };

        const csvRows = [headers.join(',')]; // Header row

        orders.forEach(order => {
            const row = [
                order.orderId, new Date(order.date).toISOString(), `${order.user.firstname} ${order.user.lastname}`,
                order.user.email, order.user.phone,
                `${order.user.address1}${order.user.address2 ? `, ${order.user.address2}` : ''}, ${order.user.city}, ${order.user.state} ${order.user.zip}`,
                order.total, order.items.map(item => `${item.quantity} x ${item.name}`).join('; ')
            ].map(escapeCsvCell).join(',');
            csvRows.push(row);
        });
        
        res.header('Content-Type', 'text/csv');
        res.attachment('orders.csv');
        res.send(csvRows.join('\n'));
    } catch (error) {
        console.error('Error exporting orders:', error);
        res.status(500).json({ error: 'Failed to export orders.' });
    }
});

app.get('/api/admin/dashboard-stats', adminAuth, async (req, res) => {
    try {
        // 1. Get total revenue and total orders
        const orderStats = await Order.aggregate([
            {
                $group: {
                    _id: null,
                    totalRevenue: { $sum: '$total' },
                    totalOrders: { $sum: 1 }
                }
            }
        ]);

        // 2. Get 5 most recent orders
        const recentOrders = await Order.find().sort({ date: -1 }).limit(5).lean();

        // 3. Get top 5 selling products
        const topSellingProducts = await Order.aggregate([
            { $unwind: '$items' },
            {
                $group: {
                    _id: { id: '$items.id', name: '$items.name' },
                    totalQuantity: { $sum: '$items.quantity' }
                }
            },
            { $sort: { totalQuantity: -1 } },
            { $limit: 5 },
            { 
                $project: {
                    _id: 0,
                    id: '$_id.id',
                    name: '$_id.name',
                    totalQuantity: 1
                }
            }
        ]);

        res.json({
            ...orderStats[0],
            recentOrders,
            topSellingProducts
        });
    } catch (error) {
        console.error('Error fetching dashboard stats:', error);
        res.status(500).json({ error: 'Failed to fetch dashboard statistics.' });
    }
});

// --- Config Endpoints ---
app.get('/api/config/maps-key', (req, res) => {
    // Send the Google Maps API key from environment variables to the client
    res.json({ apiKey: process.env.GOOGLE_MAPS_API_KEY });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.post('/api/razorpay/create-order', async (req, res) => {
    try {
        const { total } = req.body;
        if (!total) {
            return res.status(400).json({ success: false, error: "Total amount is required."});
        }

        const options = {
            amount: Math.round(total * 100), // amount in the smallest currency unit (paise)
            currency: "INR",
            receipt: `receipt_order_${new Date().getTime()}`,
        };

        const razorpayOrder = await razorpay.orders.create(options);
        if (!razorpayOrder) {
            return res.status(500).send('Error creating Razorpay order');
        }
        
        res.status(200).json({
            success: true,
            order: razorpayOrder,
            key_id: process.env.RAZORPAY_KEY_ID
        });
    } catch (error) {
        console.error('Error in /api/razorpay/create-order:', error);
        res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
});

// Endpoint 2: Verify Payment & Create Order in DB
app.post('/api/razorpay/capture', async (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderDetails } = req.body;
        
        if(!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !orderDetails) {
             return res.status(400).json({ success: false, error: 'Missing required data.' });
        }

        // Step 1: Verify the signature
        const shasum = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET);
        shasum.update(`${razorpay_order_id}|${razorpay_payment_id}`);
        const digest = shasum.digest('hex');

        if (digest === razorpay_signature) {
            // Step 2: Signature is valid. Create the order in your database.
            const { user, items, total } = orderDetails;
            const newOrder = new Order({
                orderId: razorpay_order_id,
                user,
                items,
                total,
                paymentStatus: 'confirmed',
                razorpay: {
                    orderId: razorpay_order_id,
                    paymentId: razorpay_payment_id,
                    signature: razorpay_signature
                }
            });
            await newOrder.save();
            
            res.json({
                success: true,
                message: 'Payment successful and order created',
                orderId: newOrder.orderId
            });
        } else {
            res.status(400).json({ success: false, error: 'Invalid signature' });
        }
    } catch (error) {
        console.error('Error in /api/razorpay/capture:', error);
        res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
});

app.get('/api/my-orders', userAuth, async (req, res) => {
    try {
        const orders = await Order.find({ 'user.email': req.userEmail })
            .sort({ date: -1 })
            .lean();

        // To enrich items with their current image
        const productIds = [...new Set(orders.flatMap(o => o.items.map(i => i.id)))];
        const products = await Product.find({ legacyId: { $in: productIds } }).lean();
        const productImages = products.reduce((acc, p) => {
            acc[p.legacyId] = (p.images && p.images.length > 0) ? p.images[0] : 'https://placehold.co/64x64';
            return acc;
        }, {});

        const enrichedOrders = orders.map(order => ({
            ...order,
            items: order.items.map(item => ({
                ...item,
                image: productImages[item.id] || 'https://placehold.co/64x64'
            }))
        }));

        res.json(enrichedOrders);
    } catch (error) {
        console.error('Error fetching user orders:', error);
        res.status(500).json({ error: 'Failed to fetch your orders.' });
    }
});

app.put('/api/admin/orders/:orderId/status', adminAuth, async (req, res) => {
    try {
        const { orderId } = req.params;
        const { status } = req.body;

        // Validate the status against the schema enum
        if (!Order.schema.path('shippingStatus').enumValues.includes(status)) {
            return res.status(400).json({ error: 'Invalid status value.' });
        }

        const updatedOrder = await Order.findOneAndUpdate(
            { orderId: orderId },
            { $set: { shippingStatus: status } },
            { new: true }
        );

        if (!updatedOrder) return res.status(404).json({ error: 'Order not found.' });
        res.json(updatedOrder);
    } catch (error) {
        console.error('Error updating order status:', error);
        res.status(500).json({ error: 'Failed to update order status.' });
    }
});

// --- Server Startup ---
async function startServer() {
    const connectWithRetry = async () => {
        try {
            console.log('Attempting to connect to MongoDB...');
            await mongoose.connect(MONGO_URI);
            console.log('Successfully connected to MongoDB.');
        } catch (err) {
            console.error('MongoDB connection error:', err.message);
            console.log('Retrying connection in 5 seconds...');
            setTimeout(connectWithRetry, 5000); // Retry after 5 seconds
        }
    };

    await connectWithRetry();

    mongoose.connection.on('disconnected', () => {
        console.error('MongoDB disconnected! Attempting to reconnect...');
        connectWithRetry();
    });

    // This part of the code will only run after a successful initial connection.
    try {
        // The server logic that depends on the DB connection
        // can now be placed here, confident that the connection is established.
        
        // Check if the database is empty. If so, seed it from products.json.
        const productCount = await Product.countDocuments();
        if (productCount === 0) {
            console.log('Database is empty. Seeding from products.json...');
            try {
                const productsJsonPath = path.resolve(process.cwd(), 'products.json');
                const productsData = await fs.readFile(productsJsonPath, 'utf-8');
                const productsFromFile = JSON.parse(productsData);

                const productsToSeed = [];
                const commentsToSeed = [];

                for (const product of productsFromFile) {
                    const { reviews, id, ...productDetails } = product;
                    
                    // Prepare product for DB
                    productsToSeed.push({
                        ...productDetails,
                        legacyId: id, // Map 'id' from JSON to 'legacyId' in schema
                        rating: product.rating || 0,
                        reviewsCount: reviews ? reviews.length : 0
                    });

                    // Prepare comments for DB
                    if (reviews && Array.isArray(reviews)) {
                        reviews.forEach(review => {
                            commentsToSeed.push({
                                productId: id,
                                username: review.user,
                                comment: review.comment,
                                rating: review.rating
                            });
                        });
                    }
                }

                await Product.insertMany(productsToSeed);
                await Comment.insertMany(commentsToSeed);
                console.log('Database seeded successfully with products and comments.');

            } catch (seedError) {
                console.error('Error seeding database:', seedError);
            }
        } else {
            console.log('Database already contains products. Skipping seeding.');
        }

        app.listen(PORT, () => {
            console.log(`\n🚀 Server running at http://localhost:${PORT}`);
            console.log(`Access your main site at: http://localhost:${PORT}/index.html`);
            console.log(`Admin dashboard at: http://localhost:${PORT}/admin.html`);
        });
    } catch (err) {
        console.error('FATAL: Server startup error:', err);
        process.exit(1);
    }
}

startServer();