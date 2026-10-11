import { Hono } from "hono";
import { prisma } from "@vedaa/database";
import { AppError } from "@vedaa/shared";

export function createCategoriesRoutes() {
  const app = new Hono();

  app.get("/", async (c) => {
    const categories = await prisma.category.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
      include: { _count: { select: { products: { where: { isActive: true } } } } },
    });
    return c.json({
      data: categories.map((cat) => ({
        id: cat.id,
        name: cat.name,
        slug: cat.slug,
        description: cat.description,
        imageUrl: cat.imageUrl,
        productCount: cat._count.products,
      })),
    });
  });

  app.get("/:slug", async (c) => {
    const slug = c.req.param("slug");
    const category = await prisma.category.findFirst({
      where: { slug, isActive: true },
    });
    if (!category) {
      throw new AppError("Category not found", "NOT_FOUND", 404);
    }
    return c.json({ data: category });
  });

  return app;
}
