// Test-mode payment gateway.
//
// Simulates what a real card processor does (validation, approval/decline, a payment id)
// without moving any real money. Behaviour is controlled by special test card numbers,
// the same idea real gateways use for their sandboxes:
//
//   4242 4242 4242 4242  -> approved
//   4000 0000 0000 0002  -> declined (card_declined)
//   4000 0000 0000 9995  -> declined (insufficient_funds)
//   Any other number that passes the Luhn check -> approved
//
// Card details are only used in memory; callers store just the brand and last 4 digits.

const crypto = require('crypto');

const PROCESSING_DELAY_MS = 1200;

const TEST_DECLINES = {
    '4000000000000002' : 'card_declined',
    '4000000000009995' : 'insufficient_funds',
};

const DECLINE_MESSAGES = {
    card_declined : 'Your card was declined.',
    insufficient_funds : 'Your card has insufficient funds.',
    invalid_number : 'Your card number is invalid.',
    invalid_expiry : 'Your card\'s expiry date is invalid.',
    expired_card : 'Your card has expired.',
    invalid_cvc : 'Your card\'s security code is invalid.',
};

// Luhn checksum: catches typos in card numbers
function passesLuhn(digits) {
    let sum = 0;
    for (let i = 0; i < digits.length; i++) {
        let digit = Number(digits[digits.length - 1 - i]);
        if (i % 2 === 1) {
            digit *= 2;
            if (digit > 9) digit -= 9;
        }
        sum += digit;
    }
    return sum % 10 === 0;
}

function detectBrand(digits) {
    if (/^4/.test(digits)) return 'visa';
    if (/^(5[1-5]|2[2-7])/.test(digits)) return 'mastercard';
    if (/^3[47]/.test(digits)) return 'amex';
    if (/^(60|65|81|82)/.test(digits)) return 'rupay';
    return 'card';
}

// "MM/YYYY" -> { month, year }
function parseExpiry(expiry) {
    const match = String(expiry).trim().match(/^(\d{2})\s*\/\s*(\d{4})$/);
    return { month : Number(match[1]), year : Number(match[2]) };
}

function declined(code) {
    return { status : 'declined', declineCode : code, message : DECLINE_MESSAGES[code] };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Charge a card.
 * @param {{ amountCents: number, currency: string, card: { number: string, expiry: string, cvc: string } }} request
 * @returns {Promise<{ status: 'succeeded'|'declined', id: string, brand: string, last4: string, declineCode?: string, message?: string }>}
 */
async function charge({ amountCents, currency, card }) {
    await sleep(PROCESSING_DELAY_MS); // a real gateway call takes a moment too

    const id = 'pay_test_' + crypto.randomBytes(12).toString('hex');
    const digits = String(card.number || '').replace(/[\s-]/g, '');
    const brand = detectBrand(digits);
    const last4 = digits.slice(-4);
    const base = { id, brand, last4, amountCents, currency };

    if (!/^\d{12,19}$/.test(digits) || !passesLuhn(digits)) {
        return { ...base, ...declined('invalid_number') };
    }

    const { month, year } = parseExpiry(card.expiry);
    if (month < 1 || month > 12) {
        return { ...base, ...declined('invalid_expiry') };
    }

    // A card is valid until the end of its expiry month
    const endOfExpiryMonth = new Date(year, month, 1);
    if (endOfExpiryMonth <= new Date()) {
        return { ...base, ...declined('expired_card') };
    }

    const cvcLength = brand === 'amex' ? 4 : 3;
    if (!new RegExp(`^\\d{${cvcLength}}$`).test(String(card.cvc || ''))) {
        return { ...base, ...declined('invalid_cvc') };
    }

    if (TEST_DECLINES[digits]) {
        return { ...base, ...declined(TEST_DECLINES[digits]) };
    }

    return { ...base, status : 'succeeded' };
}

module.exports = { charge };
