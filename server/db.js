// ============================================
// FIX LỖI DNS SRV TRÊN WINDOWS/NODE.JS
// Phải đặt TRƯỚC tất cả import khác thì mới có hiệu lực
// ============================================
import dns from 'node:dns';
dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);

import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

// ============================================
// CONNECTION STRING
// Ưu tiên đọc từ .env, fallback về hard-code
// ============================================
const uri =
  process.env.MONGODB_URI ||
  'mongodb+srv://tungtruong31231022130_db_user:1234@cluster0.nu2pxv1.mongodb.net/ueh_media?retryWrites=true&w=majority';

// ============================================
// MONGO CLIENT OPTIONS
// ⚠️ MongoDB Node Driver v6 KHÔNG hỗ trợ autoIndex
// (đó là option của Mongoose, không phải driver thuần)
// ============================================
const client = new MongoClient(uri, {
  maxPoolSize: 10,
  minPoolSize: 2,
  connectTimeoutMS: 15000,
  socketTimeoutMS: 45000,
  serverSelectionTimeoutMS: 15000,
});

let db = null;
let isConnected = false;

// ============================================
// CONNECT
// ============================================
export async function connectDB() {
  if (isConnected && db) {
    console.log('ℹ️  MongoDB already connected — reusing existing connection');
    return db;
  }

  try {
    console.log('🔄 Connecting to MongoDB...');
    await client.connect();

    // Lấy tên database từ URI, fallback 'ueh_media'
    const dbName = extractDbName(uri) || 'ueh_media';
    db = client.db(dbName);
    isConnected = true;

    // Ping để chắc chắn kết nối hoạt động
    await db.command({ ping: 1 });
    console.log(`✅ Connected to MongoDB database: "${dbName}"`);

    // Tạo indexes cho collection articles
    await ensureIndexes(db);

    return db;
  } catch (err) {
    isConnected = false;
    db = null;
    console.error('❌ MongoDB connection failed:', err.message);
    console.error('   ↳ Host:', safeHostFromUri(uri));
    console.error('   ↳ Gợi ý: Kiểm tra IP whitelist trên Atlas, mật khẩu, hoặc thử đổi sang connection string dạng mongodb:// (không SRV)');
    throw err;
  }
}

// ============================================
// ENSURE INDEXES
// ============================================
async function ensureIndexes(database) {
  try {
    const articles = database.collection('articles');
    await articles.createIndex({ id: 1 }, { unique: true, sparse: true });
    await articles.createIndex({ publishedAt: -1 });
    await articles.createIndex({ sentiment: 1 });
    await articles.createIndex({ crisisAlert: 1 });
    await articles.createIndex({ outlet: 1 });
    console.log('✅ MongoDB indexes ensured');
  } catch (err) {
    console.warn('⚠️  Could not create indexes:', err.message);
  }
}

// ============================================
// GET DB (dùng trong route handlers)
// ============================================
export function getDB() {
  if (!db || !isConnected) {
    throw new Error('Database not connected. Call connectDB() first.');
  }
  return db;
}

// ============================================
// DISCONNECT (gọi khi tắt app)
// ============================================
export async function closeDB() {
  if (!isConnected) {
    console.log('ℹ️  MongoDB already disconnected');
    return;
  }
  try {
    await client.close();
    console.log('🔌 MongoDB connection closed');
  } catch (err) {
    console.error('❌ Error closing MongoDB:', err.message);
  } finally {
    db = null;
    isConnected = false;
  }
}

// ============================================
// HELPERS
// ============================================

// Trích xuất tên database từ URI
// vd: mongodb+srv://user:pass@host/ueh_media?retryWrites=true → "ueh_media"
function extractDbName(connectionString) {
  try {
    const afterHost = connectionString.split('@')[1];
    if (!afterHost) return null;
    const dbPart = afterHost.split('/')[1];
    if (!dbPart) return null;
    return dbPart.split('?')[0].split('#')[0] || null;
  } catch {
    return null;
  }
}

// Ẩn thông tin nhạy cảm khi log
function safeHostFromUri(connectionString) {
  try {
    const afterHost = connectionString.split('@')[1] || '';
    return afterHost.split('/')[0].split('?')[0] || '(unknown host)';
  } catch {
    return '(unknown host)';
  }
}

// ============================================
// HEALTH CHECK (dùng cho /api/health)
// ============================================
export async function checkDBHealth() {
  try {
    if (!db || !isConnected) {
      return { status: 'disconnected', ok: false };
    }
    await db.command({ ping: 1 });
    return {
      status: 'connected',
      ok: true,
      database: db.databaseName,
    };
  } catch (err) {
    return { status: 'error', ok: false, error: err.message };
  }
}