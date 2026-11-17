// Plan definitions and helpers shared by notes and billing code.

const FREE_NOTE_LIMIT = 10;

const PLANS = {
    free: {
        id: 'free',
        name: 'Free',
        priceCents: 0,
        currency: 'INR',
        features: [`Up to ${FREE_NOTE_LIMIT} notes`, 'File attachments', 'Trash with restore'],
    },
    pro_monthly: {
        id: 'pro_monthly',
        name: 'Pro',
        priceCents: 14900, // ₹149.00
        currency: 'INR',
        interval: 'month',
        periodDays: 30,
        features: ['Unlimited notes', 'File attachments', 'Trash with restore', 'Priority support'],
    },
};

// A user only counts as Pro while their plan is 'active' AND not past its expiry date.
function isPro(user) {
    return user.plan === 'active'
        && user.plan_expires_on !== null
        && new Date(user.plan_expires_on) > new Date();
}

module.exports = { FREE_NOTE_LIMIT, PLANS, isPro };
