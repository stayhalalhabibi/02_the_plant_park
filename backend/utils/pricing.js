
const BUNDLE_SIZE = 4;
const BUNDLE_PRICE_PAISE = 119900;
const PERCENTAGE_DISCOUNT_RATE = 10;
const PERCENTAGE_DISCOUNT_THRESHOLD_PAISE = 149900;
const FREE_SHIPPING_THRESHOLD_PAISE = 49900;
const SHIPPING_FEE_PAISE = 4900;

function toPaise(value, fieldName) {
    const amount = Number(value);

    if (!Number.isFinite(amount) || amount < 0) {
        throw new Error(`${fieldName} must be a valid non-negative amount.`);
    }

    const paise = Math.round((amount + Number.EPSILON) * 100);

    if (!Number.isSafeInteger(paise)) {
        throw new Error(`${fieldName} is too large.`);
    }

    return paise;
}

function calculatePricing(cartItems) {
    if (!Array.isArray(cartItems) || cartItems.length === 0) {
        throw new Error("Cart must contain at least one item.");
    }

    const units = [];
    let subtotalPaise = 0;

    for (const item of cartItems) {
        const pricePaise = toPaise(item.price, "Plant price");
        const quantity = Number(item.quantity);

        if (
            !Number.isSafeInteger(quantity) ||
            quantity <= 0 ||
            !Number.isSafeInteger(pricePaise) ||
            pricePaise <= 0
        ) {
            throw new Error("Each cart item must have a positive price and quantity.");
        }

        const lineTotal = pricePaise * quantity;

        if (!Number.isSafeInteger(lineTotal)) {
            throw new Error("Cart line total is too large.");
        }

        subtotalPaise += lineTotal;

        if (!Number.isSafeInteger(subtotalPaise)) {
            throw new Error("Cart subtotal is too large.");
        }

        for (let i = 0; i < quantity; i += 1) {
            units.push(pricePaise);
        }
    }

    // Group the most expensive units first for deterministic bundle pricing.
    units.sort((a, b) => b - a);

    let bundleDiscountPaise = 0;

    for (let i = 0; i + BUNDLE_SIZE <= units.length; i += BUNDLE_SIZE) {
        const groupOriginalPaise =
            units[i] +
            units[i + 1] +
            units[i + 2] +
            units[i + 3];

        // Never charge more than the group's original price.
        const groupBundlePricePaise = Math.min(
            groupOriginalPaise,
            BUNDLE_PRICE_PAISE
        );

        bundleDiscountPaise +=
            groupOriginalPaise - groupBundlePricePaise;
    }

    const postBundleSubtotalPaise =
        subtotalPaise - bundleDiscountPaise;

    const percentageDiscountPaise =
        postBundleSubtotalPaise > PERCENTAGE_DISCOUNT_THRESHOLD_PAISE
            ? Math.round(
                  (postBundleSubtotalPaise *
                      PERCENTAGE_DISCOUNT_RATE) /
                      100
              )
            : 0;

    const discountedPlantSubtotalPaise =
        postBundleSubtotalPaise - percentageDiscountPaise;

    const shippingFeePaise =
        discountedPlantSubtotalPaise > FREE_SHIPPING_THRESHOLD_PAISE
            ? 0
            : SHIPPING_FEE_PAISE;

    const totalPaise =
        discountedPlantSubtotalPaise + shippingFeePaise;

    return {
        subtotal_amount: (subtotalPaise / 100).toFixed(2),
        bundle_discount: (bundleDiscountPaise / 100).toFixed(2),
        percentage_discount: (percentageDiscountPaise / 100).toFixed(2),
        shipping_fee: (shippingFeePaise / 100).toFixed(2),
        total_amount: (totalPaise / 100).toFixed(2),
    };
}

module.exports = { calculatePricing };
