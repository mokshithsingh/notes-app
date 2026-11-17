const { pool } = require('../config/db.js');
const { FREE_NOTE_LIMIT, PLANS, isPro } = require('../utils/plans');
const paymentGateway = require('../services/paymentGateway');

const DAY_MS = 24 * 60 * 60 * 1000;

// GET /api/billing/plans -> what can be bought (public)
let plans = (req, res) => {
    res.status(200).json({plans : [PLANS.free, PLANS.pro_monthly]});
};

// GET /api/billing/account -> plan, usage and payment history for the account page
let account = async(req, res) => {
    const userResult = await pool.query(
        "SELECT id, name, email, plan, plan_expires_on, created_at FROM users WHERE id = $1",
        [req.userId]
    );
    const user = userResult.rows[0];

    if (!user) {
        return res.status(404).json({message : "No user found"});
    }

    const usage = await pool.query(
        "SELECT COUNT(*)::int AS notes FROM notes WHERE user_id = $1 AND deleted_at IS NULL",
        [req.userId]
    );

    const payments = await pool.query(
        `SELECT id, gateway_ref, plan_id, amount_cents, currency, status, card_brand, card_last4, decline_code, created_at
         FROM payments WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20`,
        [req.userId]
    );

    const pro = isPro(user);

    return res.status(200).json({
        user : {id : user.id, name : user.name, email : user.email, memberSince : user.created_at},
        plan : {
            id : pro ? 'pro_monthly' : 'free',
            name : pro ? PLANS.pro_monthly.name : PLANS.free.name,
            status : user.plan,
            renewsOn : user.plan_expires_on.toISOString(),
        },
        usage : {notes : usage.rows[0].notes, limit : pro ? null : FREE_NOTE_LIMIT},
        payments : payments.rows
    });
};

// POST /api/billing/checkout -> pay for Pro with a card
let checkout = async(req, res) => {
    const { cardNumber, expiry, cvc, cardholderName } = req.body || {};
    const plan = PLANS.pro_monthly;

    if (!cardNumber || !expiry || !cvc || !cardholderName || String(cardholderName).trim() === '') {
        return res.status(400).json({message : "Card number, expiry date, security code and cardholder name are required"});
    }

    const charge = await paymentGateway.charge({
        amountCents : plan.priceCents,
        currency : plan.currency,
        card : {number : cardNumber, expiry : expiry, cvc : cvc}
    });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        await client.query(
            `INSERT INTO payments(user_id, gateway_ref, plan_id, amount_cents, currency, status, card_brand, card_last4, decline_code)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [req.userId, charge.id, plan.id, plan.priceCents, plan.currency, charge.status, charge.brand, charge.last4, charge.declineCode || null]
        );

        if (charge.status !== 'succeeded') {
            await client.query('COMMIT');
            return res.status(402).json({message : charge.message, code : charge.declineCode});
        }

        // Extend from the current expiry if the user is still Pro, otherwise start from now
        const current = await client.query("SELECT plan, plan_expires_on FROM users WHERE id = $1 FOR UPDATE", [req.userId]);
        const startsFrom = isPro(current.rows[0]) ? new Date(current.rows[0].plan_expires_on) : new Date();
        const expiresOn = new Date(startsFrom.getTime() + plan.periodDays * DAY_MS);

        await client.query(
            "UPDATE users SET plan = 'active', plan_expires_on = $1, updated_at = NOW() WHERE id = $2",
            [expiresOn, req.userId]
        );

        await client.query('COMMIT');

        return res.status(200).json({
            message : "Payment successful. Welcome to Pro!",
            payment : {id : charge.id, amountCents : plan.priceCents, currency : plan.currency, brand : charge.brand, last4 : charge.last4},
            planExpiresOn : expiresOn
        });
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
};

exports.plans = plans;
exports.account = account;
exports.checkout = checkout;
