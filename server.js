require('dotenv').config();
const express = require('express');
const multer = require('multer');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const { put } = require('@vercel/blob');
const compression = require('compression');

const MONGO_URI = process.env.MONGO_URI;
const ADMIN_SECRET = process.env.ADMIN_SECRET;

if (!MONGO_URI) {
  console.warn('WARNING: MONGO_URI environment variable is not set.');
}
if (!ADMIN_SECRET) {
  console.warn('WARNING: ADMIN_SECRET environment variable is not set.');
}

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================
// VERCEL-OPTIMIZED MONGOOSE CONNECTION
// ============================================
let cachedDb = null;

async function connectToDatabase() {
  if (cachedDb && mongoose.connection.readyState === 1) {
    console.log('Using cached database connection');
    return cachedDb;
  }

  try {
    const connection = await mongoose.connect(MONGO_URI, {
      maxPoolSize: 5,           // Reduced for serverless
      minPoolSize: 1,
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      // Crucial for serverless: reuse connections
      bufferCommands: true,
      ssl: true,
      tls: true,
      tlsAllowInvalidCertificates: false,
      tlsAllowInvalidHostnames: false,
    });

    cachedDb = connection;
    console.log('New database connection established');
    return cachedDb;
  } catch (error) {
    console.error('Database connection error:', error);
    throw error;
  }
}

// Middleware for admin authentication
const adminAuth = (req, res, next) => {
    const secret = req.headers['x-admin-secret'] || req.query.secret;
    if (secret !== ADMIN_SECRET) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
};

// Middleware for user authentication
const userAuth = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (token == null) return res.sendStatus(401);
    req.userIdentifier = token;
    next();
};

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// ============================================
// SIMPLE RATE LIMITING (IP-based, in-memory)
// Note: This is per-function instance on Vercel
// For production, use Vercel's rate limiting or external service
// ============================================
const requestCounts = new Map();

const simpleRateLimit = (maxRequests, windowMs) => {
  return (req, res, next) => {
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    const now = Date.now();
    const key = `${ip}-${req.path}`;
    
    if (!requestCounts.has(key)) {
      requestCounts.set(key, []);
    }
    
    const requests = requestCounts.get(key).filter(time => now - time < windowMs);
    
    if (requests.length >= maxRequests) {
      return res.status(429).json({ error: 'Too many requests, please try again later.' });
    }
    
    requests.push(now);
    requestCounts.set(key, requests);
    
    // Cleanup old entries every 100 requests
    if (Math.random() < 0.01) {
      for (const [k, times] of requestCounts.entries()) {
        const filtered = times.filter(time => now - time < windowMs);
        if (filtered.length === 0) {
          requestCounts.delete(k);
        } else {
          requestCounts.set(k, filtered);
        }
      }
    }
    
    next();
  };
};

const generalLimiter = simpleRateLimit(100, 15 * 60 * 1000);
const strictLimiter = simpleRateLimit(20, 15 * 60 * 1000);
const uploadLimiter = simpleRateLimit(10, 60 * 60 * 1000);

// ============================================
// MULTER CONFIGURATION
// ============================================
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
    fileFilter: (req, file, cb) => {
        if (!file.mimetype.startsWith('image/')) {
            return cb(new Error('Only image files are allowed!'), false);
        }
        cb(null, true);
    }
});

// Middleware
app.use(cors());
app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(express.static('public', {
  maxAge: '1d',
  setHeaders: (res, path) => {
    if (path.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  }
}));

// Apply rate limiting to API routes
app.use('/api/', generalLimiter);

// ============================================
// MONGOOSE SCHEMAS WITH INDEXES
// ============================================
const ProductSchema = new mongoose.Schema({
  legacyId: { type: Number, required: true, unique: true, index: true },
  name: { 
    type: String, 
    required: [true, 'Product name is required.'], 
    trim: true,
    minlength: 3,
    maxlength: 150
  },
  dateAdded: { type: Date, default: Date.now, index: true },
  category: { type: [String], index: true },
  images: [String],
  description: { type: String, trim: true, maxlength: 2000 },
  rating: { type: Number, default: 0 },
  reviewsCount: { type: Number, default: 0 },
  sellerTag: { type: String },
  price: { 
    type: Number, 
    required: [true, 'Product price is required.'],
    min: 0,
    index: true
  },
  originalPrice: { type: Number },
  deliveryDate: { type: String }
});

const Product = mongoose.models.Product || mongoose.model('Product', ProductSchema);

const CommentSchema = new mongoose.Schema({
  productId: { type: Number, required: true, index: true },
  username: { type: String, required: true, trim: true },
  comment: { type: String, required: true, trim: true },
  rating: { type: Number, min: 1, max: 5, index: true },
  createdAt: { type: Date, default: Date.now, index: true },
  verifiedPurchase: { type: Boolean, default: false }
});

CommentSchema.index({ productId: 1, createdAt: -1 });
CommentSchema.index({ productId: 1, rating: -1 });

const Comment = mongoose.models.Comment || mongoose.model('Comment', CommentSchema);

const OrderSchema = new mongoose.Schema({
  orderId: { type: String, required: true, unique: true, index: true },
  date: { type: Date, default: Date.now, index: true },
  user: {
    firstname: { type: String, required: true, trim: true },
    lastname: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, match: [/.+@.+\..+/, 'Please enter a valid email address'], index: true },
    phone: { type: String, required: true, trim: true, index: true },
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
  paymentStatus: { type: String, default: 'pending', index: true },
  razorpay: {
    orderId: String,
    paymentId: String,
    signature: String
  },
  shippingStatus: {
    type: String,
    enum: ['Pending', 'Shipped', 'Delivered', 'Cancelled'],
    default: 'Pending',
    required: true,
    index: true
  },
  tracking: {
    carrier: { type: String, trim: true },
    number: { type: String, trim: true }
  }
});

OrderSchema.index({ 'user.email': 1, date: -1 });
OrderSchema.index({ 'user.phone': 1, date: -1 });

const Order = mongoose.models.Order || mongoose.model('Order', OrderSchema);

const ConfigSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, index: true },
  value: mongoose.Schema.Types.Mixed
});

const Config = mongoose.models.Config || mongoose.model('Config', ConfigSchema);

// ============================================
// MIDDLEWARE TO ENSURE DB CONNECTION
// ============================================
app.use(async (req, res, next) => {
  try {
    await connectToDatabase();
    next();
  } catch (error) {
    console.error('Database connection failed:', error);
    res.status(503).json({ error: 'Service temporarily unavailable' });
  }
});

// ============================================
// API ENDPOINTS
// ============================================

app.get('/api/products', async (req, res) => {
    try {
        await connectToDatabase(); // Ensure connection before queries
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
        else { sortOptions = { legacyId: 1 }; }

        const pageNum = Math.max(1, parseInt(page));
        const limitNum = Math.min(50, Math.max(1, parseInt(limit)));
        const skip = (pageNum - 1) * limitNum;

        const totalProducts = await Product.countDocuments(query);
        const totalPages = Math.ceil(totalProducts / limitNum);

        const productsFromDB = await Product.find(query)
            .select('-__v -_id')
            .sort(sortOptions)
            .skip(skip)
            .limit(limitNum)
            .lean();

        const formattedProducts = (productsFromDB || []).map(product => {
            const productObj = { ...product };
            productObj.id = productObj.legacyId;
            delete productObj.legacyId;
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
        const product = await Product.findOne({ legacyId: parseInt(req.params.id) })
            .select('-__v')
            .lean();
            
        if (!product) {
            return res.status(404).json({ error: 'Product not found.' });
        }

        product.id = product.legacyId;
        delete product.legacyId;
        
        res.json(product);
    } catch (error) {
        console.error('Error fetching single product:', error);
        res.status(500).json({ error: 'Failed to fetch product.' });
    }
});

app.post('/api/upload', uploadLimiter, adminAuth, upload.single('image'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded.' });
    }

    try {
        const filename = `${Date.now()}-${req.file.originalname}`;
        const blob = await put(filename, req.file.buffer, {
          access: 'public',
        });
        res.status(201).json({ url: blob.url });
    } catch (error) {
        console.error('Error uploading to Vercel Blob:', error);
        res.status(500).json({ error: 'Failed to upload image.' });
    }
}, (error, req, res, next) => {
    res.status(400).json({ error: error.message });
});

app.post('/api/products', adminAuth, async (req, res) => {
    try {
        const productData = { ...req.body };
        delete productData._id;
        delete productData.id;

        const newProduct = new Product({
            ...productData,
            legacyId: productData.legacyId,
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
        ).select('-__v');
        
        if (!updatedProduct) {
            return res.status(404).json({ error: 'Product not found.' });
        }
        
        const productObj = updatedProduct.toObject();
        productObj.id = productObj.legacyId;
        delete productObj.legacyId;
        
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
        const stars = req.query.stars;
        
        const query = { productId: parseInt(legacyId) };
        if (stars) {
            const starFilters = stars.split(',').map(Number).filter(n => n >= 1 && n <= 5);
            if (starFilters.length > 0) {
                query.rating = { $in: starFilters };
            }
        }

        let sortOptions = { createdAt: -1 };
        if (sort === 'oldest') sortOptions = { createdAt: 1 };
        else if (sort === 'highest') sortOptions = { rating: -1, createdAt: -1 };
        else if (sort === 'lowest') sortOptions = { rating: 1, createdAt: -1 };

        const comments = await Comment.find(query)
            .sort(sortOptions)
            .select('-__v')
            .limit(100)
            .lean();
        
        res.json(comments);
    } catch (error) {
        console.error('Error fetching comments:', error);
        res.status(500).json({ message: 'Server error while fetching comments.' });
    }
});

app.post('/api/products/:id/reviews', strictLimiter, async (req, res) => {
    const productId = req.params.id;
    try {
        const product = await Product.findOne({ legacyId: parseInt(productId) });
        if (!product) {
            return res.status(404).json({ error: `Product with ID ${productId} not found.` });
        }

        const { user, rating, comment } = req.body;
        if (!user || !rating || !comment || rating < 1 || rating > 5) {
            return res.status(400).json({ error: 'Missing required review fields: user, rating, comment' });
        }

        let isVerified = false;
        const ordersWithProduct = await Order.find({ 
            'items.id': product.legacyId 
        }).select('user.firstname user.lastname').lean();
        
        if (ordersWithProduct.length > 0) {
            const reviewerName = user.toLowerCase().trim();
            isVerified = ordersWithProduct.some(order => {
                const customerName = `${order.user.firstname || ''} ${order.user.lastname || ''}`.toLowerCase().trim();
                return customerName.includes(reviewerName);
            });
        }

        const newComment = new Comment({
            productId: product.legacyId,
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
            product.rating = Math.round(stats[0].avgRating * 10) / 10;
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

// Config Endpoints
app.get('/api/admin/config/carousel', adminAuth, async (req, res) => {
    try {
        const config = await Config.findOne({ key: 'carouselProductIds' }).lean();
        res.json(config ? config.value : []);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch carousel config' });
    }
});

app.put('/api/admin/config/carousel', adminAuth, async (req, res) => {
    try {
        const { productIds } = req.body;
        await Config.findOneAndUpdate(
            { key: 'carouselProductIds' },
            { value: productIds },
            { upsert: true, new: true }
        );
        res.status(200).json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update carousel config' });
    }
});

app.get('/api/admin/config/top-picks', adminAuth, async (req, res) => {
    try {
        const config = await Config.findOne({ key: 'topPicksProductIds' }).lean();
        res.json(config ? config.value : []);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch top picks config' });
    }
});

app.put('/api/admin/config/top-picks', adminAuth, async (req, res) => {
    try {
        const { productIds } = req.body;
        await Config.findOneAndUpdate(
            { key: 'topPicksProductIds' },
            { value: productIds },
            { upsert: true, new: true }
        );
        res.status(200).json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update top picks config' });
    }
});

app.get('/api/config/carousel-slides', async (req, res) => {
    try {
        const config = await Config.findOne({ key: 'carouselProductIds' }).lean();
        if (!config || !config.value || config.value.length === 0) {
            return res.json([]);
        }
        const products = await Product.find({ legacyId: { $in: config.value } })
            .select('-__v')
            .lean();
        const sortedProducts = config.value.map(id => products.find(p => p.legacyId === id)).filter(Boolean);
        res.json(sortedProducts);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch carousel slides' });
    }
});

app.get('/api/config/top-picks-products', async (req, res) => {
    try {
        const config = await Config.findOne({ key: 'topPicksProductIds' }).lean();
        if (!config || !config.value || config.value.length === 0) {
            return res.json([]);
        }
        const products = await Product.find({ legacyId: { $in: config.value } })
            .select('-__v')
            .lean();
        const sortedProducts = config.value.map(id => products.find(p => p.legacyId === id)).filter(Boolean);
        res.json(sortedProducts);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch top picks' });
    }
});

// Order Endpoints
app.get('/api/admin/orders', adminAuth, async (req, res) => {
    try {
        const { search, page = 1, limit = 10 } = req.query;
        let query = {};

        if (search) {
            const searchRegex = { $regex: search, $options: 'i' };
            query.$or = [
                { orderId: searchRegex },
                { 'user.firstname': searchRegex },
                { 'user.lastname': searchRegex },
                { 'user.email': searchRegex }
            ];
        }

        const pageNum = Math.max(1, parseInt(page));
        const limitNum = Math.min(50, Math.max(1, parseInt(limit)));
        const skip = (pageNum - 1) * limitNum;

        const totalOrders = await Order.countDocuments(query);
        const totalPages = Math.ceil(totalOrders / limitNum);

        const orders = await Order.find(query)
            .sort({ date: -1 })
            .skip(skip)
            .limit(limitNum)
            .select('-__v')
            .lean();
            
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

        const orders = await Order.find(query)
            .sort({ date: -1 })
            .limit(1000)
            .lean();

        if (orders.length === 0) {
            return res.status(404).send('No orders to export.');
        }

        const headers = ['OrderID', 'Date', 'CustomerName', 'Email', 'Phone', 'Address', 'Total', 'Items'];
        
        const escapeCsvCell = (cell) => {
            if (cell === null || cell === undefined) return '';
            let str = String(cell);
            if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
        };

        const csvRows = [headers.join(',')];

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
        const orderStats = await Order.aggregate([
            {
                $group: {
                    _id: null,
                    totalRevenue: { $sum: '$total' },
                    totalOrders: { $sum: 1 }
                }
            }
        ]);

        const recentOrders = await Order.find()
            .sort({ date: -1 })
            .limit(5)
            .select('-__v')
            .lean();

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
            ...(orderStats[0] || { totalRevenue: 0, totalOrders: 0 }),
            recentOrders,
            topSellingProducts
        });
    } catch (error) {
        console.error('Error fetching dashboard stats:', error);
        res.status(500).json({ error: 'Failed to fetch dashboard statistics.' });
    }
});

app.get('/api/health', async (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        dbStatus: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
        environment: 'vercel'
    });
});

app.post('/api/razorpay/create-order', strictLimiter, async (req, res) => {
    try {
        const { total } = req.body;
        if (!total) {
            return res.status(400).json({ success: false, error: "Total amount is required."});
        }

        const options = {
            amount: Math.round(total * 100),
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

app.post('/api/razorpay/capture', async (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderDetails } = req.body;
        
        if(!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !orderDetails) {
             return res.status(400).json({ success: false, error: 'Missing required data.' });
        }

        const shasum = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET);
        shasum.update(`${razorpay_order_id}|${razorpay_payment_id}`);
        const digest = shasum.digest('hex');

        if (digest === razorpay_signature) {
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

app.post('/api/auth/check-email', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required.' });
    res.json({ success: true });
});

app.get('/api/my-orders', userAuth, async (req, res) => {
    try {
        const identifier = req.userIdentifier;
        const orders = await Order.find({
            $or: [
                { 'user.email': identifier },
                { 'user.phone': identifier }
            ]
        })
            .sort({ date: -1 })
            .select('-__v')
            .lean();

        const productIds = [...new Set(orders.flatMap(o => o.items.map(i => i.id)))];
        const products = await Product.find({ legacyId: { $in: productIds } })
            .select('legacyId images')
            .lean();
            
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
        const { status, trackingNumber, trackingCarrier } = req.body;

        const updatePayload = {};

        if (status) {
            if (!Order.schema.path('shippingStatus').enumValues.includes(status)) {
                return res.status(400).json({ error: 'Invalid status value.' });
            }
            updatePayload.shippingStatus = status;
        }

        updatePayload['tracking.number'] = trackingNumber || '';
        updatePayload['tracking.carrier'] = trackingCarrier || '';

        const updatedOrder = await Order.findOneAndUpdate(
            { orderId: orderId },
            { $set: updatePayload },
            { new: true }
        ).select('-__v');

        if (!updatedOrder) return res.status(404).json({ error: 'Order not found.' });
        res.json(updatedOrder);
    } catch (error) {
        console.error('Error updating order status:', error);
        res.status(500).json({ error: 'Failed to update order status.' });
    }
});

// ============================================
// ERROR HANDLING
// ============================================

// Handle 404
app.use((req, res) => {
    res.status(404).json({ error: 'Route not found' });
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ 
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// ============================================
// VERCEL SERVERLESS EXPORT
// ============================================

// For Vercel, we export the app directly
// The connection is established per request via middleware
module.exports = app;

// For local development
if (process.env.NODE_ENV !== 'production') {
    const startLocalServer = async () => {
        try {
            await connectToDatabase();
            
            app.listen(PORT, () => {
                console.log('\n╔════════════════════════════════════════════════════════╗');
                console.log('║  🚀 LOCAL DEVELOPMENT SERVER                          ║');
                console.log('╚════════════════════════════════════════════════════════╝');
                console.log(`\n📍 Main site:        http://localhost:${PORT}/index.html`);
                console.log(`📍 Admin dashboard:  http://localhost:${PORT}/admin.html`);
                console.log(`📍 Health check:     http://localhost:${PORT}/api/health`);
                console.log('\n⚡ Optimizations enabled:');
                console.log('   ✓ Connection caching for serverless');
                console.log('   ✓ Simple rate limiting');
                console.log('   ✓ Database indexes');
                console.log('   ✓ Response compression');
                console.log('   ✓ Lean queries\n');
            });
        } catch (error) {
            console.error('Failed to start local server:', error);
            process.exit(1);
        }
    };

    startLocalServer();
}

