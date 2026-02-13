/**
 * BACKEND ÖRNEK KOD - Subscription Verification Endpoint
 * 
 * Bu dosya backend'e eklenecek endpoint örneğidir.
 * Framework: Express.js (Node.js)
 * 
 * Kurulum:
 * npm install axios iap
 */

const express = require('express');
const axios = require('axios');
const iap = require('iap');

const router = express.Router();

// Apple ve Google credentials (environment variables'dan alınmalı)
const APPLE_SHARED_SECRET = process.env.APPLE_SHARED_SECRET; // App Store Connect'ten al
const GOOGLE_SERVICE_ACCOUNT = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON); // Google Cloud'dan al

// IAP configuration
iap.config({
  applePassword: APPLE_SHARED_SECRET,
  googleServiceAccount: GOOGLE_SERVICE_ACCOUNT,
  test: process.env.NODE_ENV !== 'production', // Sandbox/test mode
});

/**
 * POST /api/subscriptions/verify
 * 
 * Mobile app'ten gelen receipt/token'ı doğrular ve
 * kullanıcıya premium özellikler atar.
 */
router.post('/subscriptions/verify', async (req, res) => {
  try {
    const { platform, productId, transactionReceipt, purchaseToken, transactionId } = req.body;
    const userId = req.user.id; // JWT middleware'den gelen user ID

    console.log('[Subscription] Verify request:', { userId, platform, productId });

    let verificationResult;
    let expiresDate;
    let isActive = false;

    // Platform bazlı doğrulama
    if (platform === 'ios') {
      // iOS Receipt Validation
      verificationResult = await verifyAppleReceipt(transactionReceipt, productId);
      
      if (!verificationResult.isValid) {
        return res.status(400).json({
          error: 'Invalid receipt',
          message: 'Apple receipt doğrulanamadı',
        });
      }

      expiresDate = verificationResult.expiresDate;
      isActive = verificationResult.isActive;

    } else if (platform === 'android') {
      // Android Purchase Token Validation
      verificationResult = await verifyGooglePurchase(productId, purchaseToken);

      if (!verificationResult.isValid) {
        return res.status(400).json({
          error: 'Invalid purchase',
          message: 'Google purchase doğrulanamadı',
        });
      }

      expiresDate = verificationResult.expiryTimeMillis
        ? new Date(parseInt(verificationResult.expiryTimeMillis))
        : null;
      isActive = verificationResult.isActive;

    } else {
      return res.status(400).json({ error: 'Invalid platform' });
    }

    // Veritabanı güncelleme
    await updateUserSubscription(userId, {
      platform,
      productId,
      transactionId,
      expiresDate,
      isActive,
    });

    console.log('[Subscription] Verify success:', { userId, expiresDate, isActive });

    return res.json({
      success: true,
      subscription: {
        productId,
        expiresDate,
        isActive,
      },
    });

  } catch (error) {
    console.error('[Subscription] Verify error:', error);
    return res.status(500).json({
      error: 'Verification failed',
      message: error.message,
    });
  }
});

/**
 * Apple Receipt Doğrulama
 */
async function verifyAppleReceipt(receiptData, productId) {
  try {
    const receipt = {
      data: receiptData,
      productId: productId,
    };

    const validationResponse = await iap.verifyPayment('apple', receipt);
    console.log('[Apple] Validation response:', validationResponse);

    if (!validationResponse || validationResponse.length === 0) {
      return { isValid: false };
    }

    const latestReceipt = validationResponse[0];
    const expiresDate = latestReceipt.expirationDate
      ? new Date(parseInt(latestReceipt.expirationDate))
      : null;
    
    const isActive = expiresDate ? expiresDate > new Date() : false;

    return {
      isValid: true,
      expiresDate,
      isActive,
      transactionId: latestReceipt.transactionId,
    };

  } catch (error) {
    console.error('[Apple] Verification error:', error);
    throw new Error('Apple receipt verification failed');
  }
}

/**
 * Google Purchase Token Doğrulama
 */
async function verifyGooglePurchase(productId, purchaseToken) {
  try {
    const receipt = {
      data: {
        packageName: 'com.spondylus.boltexponativewind', // Android package name
        productId: productId,
        purchaseToken: purchaseToken,
      },
    };

    const validationResponse = await iap.verifyPayment('android', receipt);
    console.log('[Google] Validation response:', validationResponse);

    if (!validationResponse) {
      return { isValid: false };
    }

    const expiryTimeMillis = validationResponse.expiryTimeMillis;
    const expiresDate = expiryTimeMillis
      ? new Date(parseInt(expiryTimeMillis))
      : null;
    
    const isActive = expiresDate ? expiresDate > new Date() : false;

    return {
      isValid: true,
      expiryTimeMillis,
      expiresDate,
      isActive,
      orderId: validationResponse.orderId,
    };

  } catch (error) {
    console.error('[Google] Verification error:', error);
    throw new Error('Google purchase verification failed');
  }
}

/**
 * Kullanıcı abonelik bilgilerini güncelle
 */
async function updateUserSubscription(userId, subscriptionData) {
  const { platform, productId, transactionId, expiresDate, isActive } = subscriptionData;

  // offline_radius_km belirleme (yearly ise 50, monthly ise 20)
  const offlineRadiusKm = productId.includes('yearly') ? 50 : 20;

  // SQL query (örnek - kendi ORM'inize göre uyarlayın)
  const query = `
    UPDATE users 
    SET 
      offline_enabled = ?,
      offline_radius_km = ?,
      subscription_platform = ?,
      subscription_product_id = ?,
      subscription_transaction_id = ?,
      subscription_expires_at = ?,
      subscription_is_active = ?,
      updated_at = NOW()
    WHERE id = ?
  `;

  const params = [
    isActive, // offline_enabled
    offlineRadiusKm,
    platform,
    productId,
    transactionId,
    expiresDate,
    isActive,
    userId,
  ];

  // Execute query (örnek - database connection'ınıza göre uyarlayın)
  // await db.query(query, params);
  
  console.log('[DB] User subscription updated:', { userId, productId, expiresDate });
}

/**
 * CRON JOB - Günlük olarak süresi dolan abonelikleri kontrol et
 * 
 * Kullanım: node-cron, Bull, Agenda vb. ile schedule edin
 * Örnek: Her gün 02:00'de çalışsın
 */
async function checkExpiredSubscriptions() {
  console.log('[Cron] Checking expired subscriptions...');

  // Süresi dolan aktif abonelikleri bul
  const query = `
    SELECT id, email 
    FROM users 
    WHERE subscription_is_active = true 
      AND subscription_expires_at < NOW()
  `;

  // const expiredUsers = await db.query(query);

  // for (const user of expiredUsers) {
  //   await db.query(`
  //     UPDATE users 
  //     SET 
  //       offline_enabled = false,
  //       subscription_is_active = false,
  //       updated_at = NOW()
  //     WHERE id = ?
  //   `, [user.id]);
  //   
  //   console.log('[Cron] Downgraded user:', user.email);
  // }

  console.log('[Cron] Expired subscriptions check completed');
}

// Cron schedule örneği (node-cron kullanarak)
// const cron = require('node-cron');
// cron.schedule('0 2 * * *', checkExpiredSubscriptions); // Her gün 02:00

module.exports = router;

/**
 * KULLANIM ÖRNEĞİ:
 * 
 * // backend/index.js veya app.js
 * const subscriptionRoutes = require('./routes/subscriptions');
 * app.use('/api', subscriptionRoutes);
 * 
 * // Environment variables (.env)
 * APPLE_SHARED_SECRET=your_apple_shared_secret_from_app_store_connect
 * GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"..."}
 * NODE_ENV=production
 */
