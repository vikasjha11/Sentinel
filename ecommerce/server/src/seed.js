import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { connectDB } from './config/db.js';
import User from './models/User.js';
import Product from './models/Product.js';
import seedProducts from './seedData.js';
await connectDB();
const email = String(process.env.ADMIN_EMAIL || 'admin@tilda.local').toLowerCase(); const password = process.env.ADMIN_PASSWORD || 'ChangeThisAdminPassword123!';
let admin = await User.findOne({ email });
if (!admin) { admin = await User.create({ name: process.env.ADMIN_NAME || 'Store Admin', email, passwordHash: await bcrypt.hash(password, 12), role: 'admin' }); console.log(`Created admin account: ${email}`); }
if (await Product.countDocuments() === 0) { await Product.insertMany(seedProducts); console.log('Seeded sample products.'); }
await import('mongoose').then(m=>m.default.disconnect()); console.log('Seed complete.');
