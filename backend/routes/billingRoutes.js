const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const billingController = require('../controllers/billingController');

router.get('/plans', billingController.plans);
router.get('/account', authMiddleware.authMiddleware, billingController.account);
router.post('/checkout', authMiddleware.authMiddleware, billingController.checkout);

module.exports = router;
