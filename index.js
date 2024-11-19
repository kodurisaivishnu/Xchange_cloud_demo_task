const express = require('express');
const multer = require('multer');//for file buffer
const sharp = require('sharp'); //for compress,
const { Dropbox } = require('dropbox');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const Product = require('./models/Product');

dotenv.config();

const app = express();

// MongoDB connection
mongoose.connect(process.env.MONGO_URI, {
    // useNewUrlParser: true,
    // useUnifiedTopology: true
}).then(() => console.log('MongoDB connected')).catch(err => console.log('MongoDB error:', err));

const dbx = new Dropbox({ 
    accessToken: process.env.DROPBOX_ACCESS_TOKEN,
    fetch: fetch 
});

const storage = multer.memoryStorage();
const upload = multer({
    storage,
    limits: { files: 10 } // i can throe the LFC error i.e,, limit of file error
});

async function uploadToDropbox(file, productId) {
    try {
        let buffer = file.buffer;

        if (file.size > 5 * 1024 * 1024) {
            buffer = await sharp(file.buffer).resize({ width: 1500 }).jpeg({ quality: 80 }).toBuffer();
        }

        const timestamp = Date.now();
        const dropboxPath = `/products/${productId}/${timestamp}_${file.originalname}`;
        const uploadedFile = await dbx.filesUpload({
            path: dropboxPath,
            contents: buffer
        });

        const tempLink = await dbx.filesGetTemporaryLink({ path: uploadedFile.result.path_display });
        return tempLink.result.link;
    } catch (error) {
        throw new Error('Dropbox upload failed');
    }
}

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/', async (req, res) => {
    const products = await Product.find().sort({ createdAt: -1 });
    res.render('index', { products });
});


// Get single product
app.get('/product/:id', async (req, res) => {
  try {
    const product = await Product.findOne({ productId: req.params.id }).lean();
    if (!product) {
      return res.render('error', { 
        message: 'Product not found',
        error: { status: 404 }
      });
    }
    res.render('product', { product });
  } catch (error) {
    console.error('Error fetching product:', error);
    res.render('error', { 
      message: 'Error fetching product',
      error: { status: 500 }
    });
  }
});

app.post('/upload', upload.array('images'), async (req, res) => {
    try {
        const { productName, productId } = req.body;

        const imageUrls = await Promise.all(req.files.map(file => uploadToDropbox(file, productId)));

        const product = new Product({
            productName,
            productId,
            images: imageUrls
        });

        await product.save();
        res.redirect('/');
    } catch (error) {
        res.status(500).send('Error uploading product');
    }
});



const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
