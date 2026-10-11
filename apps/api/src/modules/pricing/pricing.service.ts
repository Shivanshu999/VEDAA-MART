import { prisma, type Prisma } from "@vedaa/database";
import { AppError } from "@vedaa/shared";

type PricingClient = Pick<Prisma.TransactionClient, "product" | "coupon">;

export type PricedLine = {
  productId: string;
  quantity: number;
  unitMrp: number;
  unitSellingPrice: number;
  lineTotal: number;
  productName: string;
  productSku: string;
  brand: string | null;
  packageSize: string | null;
};

export type OrderTotals = {
  subtotal: number;
  discountTotal: number;
  deliveryFee: number;
  handlingFee: number;
  taxTotal: number;
  grandTotal: number;
  lines: PricedLine[];
};

const DELIVERY_FEE = 29;
const HANDLING_FEE = 0;
const TAX_RATE = 0;
const roundCurrency = (amount: number) => Math.round((amount + Number.EPSILON) * 100) / 100;

export async function calculateCartTotals(
  storeId: string,
  items: { productId: string; quantity: number }[],
  couponCode?: string,
  client: PricingClient = prisma,
): Promise<OrderTotals> {
  if (items.length === 0) {
    throw new AppError("Cart is empty", "EMPTY_CART", 400);
  }

  const productIds = items.map((i) => i.productId);
  const products = await client.product.findMany({
    where: { id: { in: productIds }, isActive: true },
    include: {
      inventory: { where: { storeId } },
    },
  });

  const productMap = new Map(products.map((p) => [p.id, p]));
  const lines: PricedLine[] = [];

  for (const item of items) {
    const product = productMap.get(item.productId);
    if (!product) {
      throw new AppError("Product unavailable", "PRODUCT_NOT_FOUND", 400);
    }
    const inv = product.inventory[0];
    const availableNow = inv ? inv.stockQuantity - inv.reservedQuantity : 0;
    if (!inv || !inv.isAvailable || availableNow < item.quantity) {
      throw new AppError(`Insufficient stock for ${product.name}`, "INSUFFICIENT_STOCK", 409);
    }
    const unitSellingPrice = Number(product.sellingPrice);
    const lineTotal = roundCurrency(unitSellingPrice * item.quantity);
    lines.push({
      productId: product.id,
      quantity: item.quantity,
      unitMrp: Number(product.mrp),
      unitSellingPrice,
      lineTotal,
      productName: product.name,
      productSku: product.sku,
      brand: product.brand,
      packageSize: product.packageSize,
    });
  }

  const subtotal = roundCurrency(lines.reduce((acc, line) => acc + line.lineTotal, 0));
  let discountTotal = 0;

  if (couponCode) {
    const coupon = await client.coupon.findUnique({ where: { code: couponCode.toUpperCase() } });
    if (!coupon || !coupon.isActive) {
      throw new AppError("Invalid coupon", "INVALID_COUPON", 400);
    }
    const now = new Date();
    if (coupon.startsAt && coupon.startsAt > now) {
      throw new AppError("Coupon not yet active", "INVALID_COUPON", 400);
    }
    if (coupon.endsAt && coupon.endsAt < now) {
      throw new AppError("Coupon expired", "INVALID_COUPON", 400);
    }
    if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) {
      throw new AppError("Coupon usage limit reached", "INVALID_COUPON", 400);
    }
    if (coupon.minOrderValue && subtotal < Number(coupon.minOrderValue)) {
      throw new AppError("Minimum order value not met", "INVALID_COUPON", 400);
    }
    if (coupon.type === "PERCENTAGE") {
      discountTotal = (subtotal * Number(coupon.value)) / 100;
    } else {
      discountTotal = Number(coupon.value);
    }
    if (coupon.maxDiscount && discountTotal > Number(coupon.maxDiscount)) {
      discountTotal = Number(coupon.maxDiscount);
    }
    if (discountTotal > subtotal) {
      discountTotal = subtotal;
    }
    discountTotal = roundCurrency(discountTotal);
  }

  const taxable = roundCurrency(subtotal - discountTotal);
  const taxTotal = roundCurrency(taxable * TAX_RATE);
  const grandTotal = roundCurrency(taxable + taxTotal + DELIVERY_FEE + HANDLING_FEE);

  return {
    subtotal,
    discountTotal,
    deliveryFee: DELIVERY_FEE,
    handlingFee: HANDLING_FEE,
    taxTotal,
    grandTotal,
    lines,
  };
}
