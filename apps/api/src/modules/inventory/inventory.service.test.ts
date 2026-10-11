import { describe, expect, it } from "vitest";
import { initializeTestDatabase } from "../../test-utils/test-database.js";

const testDatabaseEnabled = initializeTestDatabase();
const modules = testDatabaseEnabled
  ? await Promise.all([import("@vedaa/database"), import("./inventory.service.js")])
  : undefined;
const prisma = modules?.[0].prisma as unknown as typeof import("@vedaa/database").prisma;
const reserveInventory = modules?.[1].reserveInventory as unknown as typeof import("./inventory.service.js").reserveInventory;
const databaseDescribe = testDatabaseEnabled ? describe : describe.skip;

function makeSuffix() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

databaseDescribe("reserveInventory (PostgreSQL integration)", () => {
  it(
    "maintains the stock invariant while reserving items",
    async () => {
      const suffix = makeSuffix();
      const storeSlug = `test-store-${suffix}`;
      const categorySlug = `test-category-${suffix}`;
      const productSlug = `test-product-${suffix}`;

      try {
        const store = await prisma.store.create({
          data: {
            name: `Test Store ${suffix}`,
            slug: storeSlug,
            addressLine: "25 Residency Road",
            city: "Bengaluru",
            state: "Karnataka",
            postalCode: "560025",
          },
        });

        const category = await prisma.category.create({
          data: {
            name: `Test Category ${suffix}`,
            slug: categorySlug,
            description: "Inventory test category",
          },
        });

        const product = await prisma.product.create({
          data: {
            name: `Test Product ${suffix}`,
            slug: productSlug,
            sku: `TEST-${suffix}`,
            categoryId: category.id,
            mrp: 120,
            sellingPrice: 100,
          },
        });

        const inventory = await prisma.storeInventory.create({
          data: {
            storeId: store.id,
            productId: product.id,
            stockQuantity: 10,
            availableStock: 10,
            reservedQuantity: 0,
            reservedStock: 0,
            lowStockThreshold: 2,
            isAvailable: true,
          },
        });

        await reserveInventory(prisma as never, store.id, [{ productId: product.id, quantity: 3 }]);

        const updated = await prisma.storeInventory.findUnique({ where: { id: inventory.id } });
        expect(updated).not.toBeNull();
        if (!updated) {
          throw new Error("Inventory record should exist after reservation");
        }
        expect(updated.stockQuantity).toBe(10);
        expect(updated.reservedQuantity).toBe(3);
        expect(updated.reservedStock).toBe(3);
        expect(updated.availableStock).toBe(7);
        expect(updated.stockQuantity - updated.reservedQuantity).toBe(updated.availableStock);

        const concurrentReservations = await Promise.allSettled([
          prisma.$transaction((tx) =>
            reserveInventory(tx, store.id, [{ productId: product.id, quantity: 4 }]),
          ),
          prisma.$transaction((tx) =>
            reserveInventory(tx, store.id, [{ productId: product.id, quantity: 4 }]),
          ),
        ]);
        expect(concurrentReservations.filter((result) => result.status === "fulfilled")).toHaveLength(1);

        const afterRace = await prisma.storeInventory.findUnique({ where: { id: inventory.id } });
        expect(afterRace?.reservedQuantity).toBe(7);
        expect(afterRace?.availableStock).toBe(3);
        expect(afterRace?.stockQuantity! - afterRace?.reservedQuantity!).toBe(afterRace?.availableStock);
      } finally {
        await prisma.storeInventory.deleteMany({ where: { store: { slug: storeSlug } } });
        await prisma.product.deleteMany({ where: { slug: productSlug } });
        await prisma.category.deleteMany({ where: { slug: categorySlug } });
        await prisma.store.deleteMany({ where: { slug: storeSlug } });
      }
    },
    15000,
  );
});
