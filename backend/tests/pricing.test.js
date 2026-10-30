
const test = require("node:test");
const assert = require("node:assert/strict");

const { calculatePricing } = require("../utils/pricing");

test("applies bundle pricing to four Monstera plants", () => {
    assert.deepEqual(
        calculatePricing([{ price: 599, quantity: 4 }]),
        {
            subtotal_amount: "2396.00",
            bundle_discount: "1197.00",
            percentage_discount: "0.00",
            shipping_fee: "0.00",
            total_amount: "1199.00",
        }
    );
});

test("applies bundle pricing before the 10% discount", () => {
    assert.deepEqual(
        calculatePricing([{ price: 599, quantity: 5 }]),
        {
            subtotal_amount: "2995.00",
            bundle_discount: "1197.00",
            percentage_discount: "179.80",
            shipping_fee: "0.00",
            total_amount: "1618.20",
        }
    );
});

test("does not make a bundle more expensive than original prices", () => {
    assert.deepEqual(
        calculatePricing([{ price: 299, quantity: 4 }]),
        {
            subtotal_amount: "1196.00",
            bundle_discount: "0.00",
            percentage_discount: "0.00",
            shipping_fee: "0.00",
            total_amount: "1196.00",
        }
    );
});

test("charges shipping at exactly ₹499", () => {
    assert.equal(
        calculatePricing([{ price: 499, quantity: 1 }]).shipping_fee,
        "49.00"
    );
});

test("offers free shipping above ₹499", () => {
    assert.equal(
        calculatePricing([{ price: 500, quantity: 1 }]).shipping_fee,
        "0.00"
    );
});

test("does not apply the percentage discount at exactly ₹1499", () => {
    assert.equal(
        calculatePricing([{ price: 1499, quantity: 1 }]).percentage_discount,
        "0.00"
    );
});

test("rejects an empty cart", () => {
    assert.throws(() => calculatePricing([]), /Cart must contain/);
});

test("rejects invalid quantities", () => {
    assert.throws(
        () => calculatePricing([{ price: 299, quantity: 0 }]),
        /positive price and quantity/
    );
});

test("rejects invalid prices", () => {
    assert.throws(
        () => calculatePricing([{ price: -10, quantity: 1 }]),
        /Plant price must be/
    );
});
