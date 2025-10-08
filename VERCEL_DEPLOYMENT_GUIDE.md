# Vercel Deployment Guide for Goshala App

## ✅ Pre-Deployment Checklist

### 1. **Environment Variables Configuration**
Before deploying, ensure ALL these environment variables are set in your Vercel project:

Go to: **Vercel Dashboard → Your Project → Settings → Environment Variables**

Add the following variables for **Production**, **Preview**, and **Development** environments:

| Variable Name | Description | Example Value |
|---------------|-------------|---------------|
| `MONGO_URI` | MongoDB connection string | `mongodb+srv://username:password@cluster.mongodb.net/goshala?retryWrites=true&w=majority` |
| `ADMIN_SECRET` | Admin authentication secret | `your_secure_admin_secret_here` |
| `RAZORPAY_KEY_ID` | Razorpay API Key ID | `rzp_live_xxxxxxxxxxxxx` |
| `RAZORPAY_KEY_SECRET` | Razorpay API Secret | `your_razorpay_secret` |
| `GOOGLE_MAPS_API_KEY` | Google Maps API Key | `AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX` |

⚠️ **CRITICAL**: Without these variables, your deployment will fail or have runtime errors.

---

### 2. **MongoDB Atlas Network Access**
Your MongoDB cluster must allow connections from Vercel's servers:

1. Go to **MongoDB Atlas → Network Access**
2. Add IP Address: `0.0.0.0/0` (Allow access from anywhere)
   - For production, consider using MongoDB's Vercel integration or static IP solution
3. Save changes

---

### 3. **Node.js Runtime Version**
Ensure your Vercel project uses Node.js 20.x or higher (required for @vercel/blob v2):

1. Go to **Vercel Dashboard → Your Project → Settings → Functions**
2. Set **Node.js Version** to `20.x` or `22.x`
3. Save changes

---

### 4. **Vercel Blob Storage**
For image uploads to work, ensure Vercel Blob is enabled:

1. Go to **Vercel Dashboard → Your Project → Storage**
2. Enable **Blob** storage if not already enabled
3. This is required for the `/api/upload` endpoint

---

## 🚀 Deployment Steps

### Option 1: Deploy via Vercel Dashboard (Recommended)

1. **Connect GitHub Repository**
   - Go to [Vercel Dashboard](https://vercel.com/dashboard)
   - Click "Add New Project"
   - Import your GitHub repository: `Taddikrishnavamsi/goshala1`

2. **Configure Build Settings**
   - Framework Preset: `Other`
   - Build Command: Leave empty or use `npm install`
   - Output Directory: Leave empty
   - Install Command: `npm install`

3. **Add Environment Variables**
   - Add all variables from the checklist above
   - Make sure to add them for all environments

4. **Deploy**
   - Click "Deploy"
   - Wait for deployment to complete

### Option 2: Deploy via Vercel CLI

```bash
# Install Vercel CLI globally
npm install -g vercel

# Login to Vercel
vercel login

# Deploy to production
vercel --prod
```

---

## 🔍 Post-Deployment Verification

### 1. **Check Deployment Logs**
- Go to **Vercel Dashboard → Your Project → Deployments → Latest Deployment**
- Click on "View Function Logs"
- Look for:
  - ✅ "Successfully connected to MongoDB"
  - ✅ "Vercel environment detected: skipping app.listen()"
  - ❌ No "FATAL" or "ReferenceError" messages

### 2. **Test API Endpoints**
Open these URLs in your browser (replace `your-domain.vercel.app` with your actual domain):

```
https://your-domain.vercel.app/api/health
Expected: {"status":"OK","timestamp":"..."}

https://your-domain.vercel.app/api/products
Expected: {"products":[...],"totalPages":...,"currentPage":...}

https://your-domain.vercel.app/index.html
Expected: Your homepage loads correctly
```

### 3. **Test Static Assets**
```
https://your-domain.vercel.app/logo.png
https://your-domain.vercel.app/about.html
https://your-domain.vercel.app/cart.html
```

### 4. **Test Admin Panel**
```
https://your-domain.vercel.app/admin.html
- Enter your ADMIN_SECRET when prompted
- Verify dashboard loads
```

---

## 🐛 Common Issues & Solutions

### Issue 1: "500 Internal Server Error" on API calls

**Symptoms:**
- API endpoints return 500 errors
- Function logs show "ReferenceError: MONGO_URI is not defined"

**Solution:**
1. Verify all environment variables are set in Vercel
2. Redeploy the project after adding variables
3. Check MongoDB Atlas network access allows Vercel IPs

---

### Issue 2: MongoDB Connection Timeout

**Symptoms:**
- Logs show "MongoDB connection error"
- API calls hang or timeout

**Solution:**
1. Check MongoDB Atlas Network Access settings
2. Verify MONGO_URI is correct and includes credentials
3. Ensure MongoDB cluster is running (not paused)
4. Check if your MongoDB plan allows external connections

---

### Issue 3: Image Upload Fails

**Symptoms:**
- `/api/upload` returns 500 error
- Logs show "@vercel/blob" errors

**Solution:**
1. Ensure Node.js version is 20.x or higher
2. Enable Vercel Blob storage in project settings
3. Verify @vercel/blob package is in dependencies
4. Check ADMIN_SECRET is correct in request headers

---

### Issue 4: Razorpay Payment Fails

**Symptoms:**
- Payment creation fails
- Checkout page shows errors

**Solution:**
1. Verify RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are set
2. Check if keys are for correct environment (test vs live)
3. Ensure Razorpay account is active
4. Check Razorpay dashboard for API errors

---

### Issue 5: Static Files Not Loading

**Symptoms:**
- CSS/JS files return 404
- Images don't load

**Solution:**
1. Verify `vercel.json` routes configuration
2. Ensure files are in the `public/` directory
3. Check file paths are relative (start with `/`)
4. Redeploy after fixing paths

---

## 📊 Monitoring & Maintenance

### View Real-time Logs
```bash
vercel logs your-project-name --follow
```

### Check Function Performance
- Go to **Vercel Dashboard → Your Project → Analytics**
- Monitor function execution time and errors

### Database Monitoring
- Monitor MongoDB Atlas metrics
- Set up alerts for connection issues
- Check database size and performance

---

## 🔄 Updating Your Deployment

### After Code Changes:
```bash
git add .
git commit -m "Your commit message"
git push origin main
```

Vercel will automatically deploy the new version.

### Manual Redeploy:
1. Go to **Vercel Dashboard → Your Project → Deployments**
2. Click "..." on latest deployment
3. Click "Redeploy"

---

## 📝 Important Notes

1. **Environment Variables**: Changes to environment variables require a redeploy
2. **Database Seeding**: First deployment will seed the database from `products.json`
3. **CORS**: The app allows all origins by default (consider restricting in production)
4. **File Uploads**: Images are stored in Vercel Blob (permanent storage)
5. **Serverless Functions**: Each API call runs in a separate serverless function instance

---

## 🆘 Getting Help

If you encounter issues not covered here:

1. **Check Vercel Logs**: Most errors are visible in function logs
2. **MongoDB Logs**: Check Atlas logs for connection issues
3. **GitHub Issues**: Report bugs at your repository
4. **Vercel Support**: Contact Vercel support for platform issues

---

## ✨ Success Indicators

Your deployment is successful when:

- ✅ All API endpoints return expected responses
- ✅ Homepage loads with products
- ✅ Admin panel is accessible with correct secret
- ✅ Cart functionality works
- ✅ Checkout and payment flow works
- ✅ Image uploads work (admin panel)
- ✅ No errors in Vercel function logs

---

**Last Updated**: January 2025
**Deployment Platform**: Vercel
**Node.js Version**: 20.x or higher
**Database**: MongoDB Atlas
