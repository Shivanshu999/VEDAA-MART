import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { prisma } from "@vedaa/database";
import { AppError } from "@vedaa/shared";

const listQuery = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(48).default(24),
  categorySlug: z.string().optional(),
  sort: z.enum(["popular", "price_asc", "price_desc", "newest"]).default("popular"),
  q: z.string().optional(),
});

function serializeProduct(
  p: Awaited<ReturnType<typeof fetchProduct>> extends infer T ? T : never,
  stock?: number,
) {
  const discount =
    Number(p.mrp) > 0
      ? Math.round(((Number(p.mrp) - Number(p.sellingPrice)) / Number(p.mrp)) * 100)
      : 0;
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    brand: p.brand,
    description: p.description,
    packageSize: p.packageSize,
    packageUnit: p.packageUnit,
    mrp: Number(p.mrp),
    sellingPrice: Number(p.sellingPrice),
    discountPercent: Math.max(0, discount),
    category: p.category,
    images: p.images,
    inStock: stock === undefined ? true : stock > 0,
    availableStock: stock,
  };
}

async function fetchProduct(where: { slug?: string; id?: string }) {
  const product = await prisma.product.findFirst({
    where: { ...where, isActive: true },
    include: {
      category: { select: { id: true, name: true, slug: true } },
      images: { orderBy: { sortOrder: "asc" } },
    },
  });
  if (!product) throw new AppError("Product not found", "NOT_FOUND", 404);
  return product;
}

export function createProductsRoutes() {
  const app = new Hono();

  app.get("/", zValidator("query", listQuery), async (c) => {
    const { page, limit, categorySlug, sort, q } = c.req.valid("query");
    const where: Record<string, unknown> = { isActive: true };
    if (categorySlug) {
      where.category = { slug: categorySlug };
    }
    if (q) {
      where.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { brand: { contains: q, mode: "insensitive" } },
        { category: { name: { contains: q, mode: "insensitive" } } },
      ];
    }
    const orderBy =
      sort === "price_asc"
        ? { sellingPrice: "asc" as const }
        : sort === "price_desc"
          ? { sellingPrice: "desc" as const }
          : sort === "newest"
            ? { createdAt: "desc" as const }
            : { createdAt: "desc" as const };

    const [total, products] = await Promise.all([
      prisma.product.count({ where }),
      prisma.product.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          category: { select: { id: true, name: true, slug: true } },
          images: { orderBy: { sortOrder: "asc" }, take: 1 },
          inventory: { select: { availableStock: true, reservedStock: true }, take: 1 },
        },
      }),
    ]);

    return c.json({
      data: products.map((p) => {
        const inv = p.inventory[0];
        const stock = inv ? inv.availableStock - inv.reservedStock : 0;
        const { inventory: _, ...rest } = p;
        return serializeProduct(rest, stock);
      }),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  });

  app.get("/search", zValidator("query", z.object({ q: z.string().min(1), limit: z.coerce.number().default(8) })), async (c) => {
    const { q, limit } = c.req.valid("query");
    const products = await prisma.product.findMany({
      where: {
        isActive: true,
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { brand: { contains: q, mode: "insensitive" } },
        ],
      },
      take: limit,
      include: {
        category: { select: { id: true, name: true, slug: true } },
        images: { orderBy: { sortOrder: "asc" }, take: 1 },
      },
    });
    return c.json({
      data: products.map((p) => serializeProduct(p)),
    });
  });

  app.get("/:slug", async (c) => {
    const slug = c.req.param("slug");
    const product = await fetchProduct({ slug });
    const related = await prisma.product.findMany({
      where: { categoryId: product.categoryId, isActive: true, NOT: { id: product.id } },
      take: 8,
      include: {
        category: { select: { id: true, name: true, slug: true } },
        images: { orderBy: { sortOrder: "asc" }, take: 1 },
      },
    });
    const inv = await prisma.storeInventory.findFirst({
      where: { productId: product.id },
    });
    const stock = inv ? inv.availableStock - inv.reservedStock : 0;
    return c.json({
      data: serializeProduct(product, stock),
      related: related.map((p) => serializeProduct(p)),
    });
  });

  return app;
}
