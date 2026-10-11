import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const CATEGORY_SEEDS = [
  { name: "Fruits", slug: "fruits", description: "Fresh, seasonal fruits picked for quality and taste." },
  { name: "Vegetables", slug: "vegetables", description: "Fresh vegetables and greens for daily cooking essentials." },
  { name: "Dairy, Bread & Eggs", slug: "dairy-bread-eggs", description: "Milk, breads, eggs and daily essentials." },
  { name: "Atta, Rice & Dal", slug: "atta-rice-dal", description: "Staples and grains for everyday cooking." },
  { name: "Snacks & Munchies", slug: "snacks-munchies", description: "Ready-to-eat favorites for quick cravings." },
  { name: "Cold Drinks & Juices", slug: "cold-drinks-juices", description: "Refreshing juices, sodas and cold drinks." },
  { name: "Breakfast & Instant Food", slug: "breakfast-instant-food", description: "Breakfast staples and instant food choices." },
  { name: "Personal Care", slug: "personal-care", description: "Daily hygiene and personal care essentials." },
  { name: "Cleaning & Household", slug: "cleaning-household", description: "Homecare, cleaning and household basics." },
  { name: "Bakery & Biscuits", slug: "bakery-biscuits", description: "Bakery goods and biscuits for snacking." },
  { name: "Dry Fruits & Nuts", slug: "dry-fruits-nuts", description: "Healthy, protein-rich dry fruits and nuts." },
] as const;

const STORE_SEED = {
  name: "Vedaa Mart Development Hub",
  slug: "vedaa-mart-development-hub",
  address: "43 Residency Road",
  addressLine: "43 Residency Road",
  city: "Bengaluru",
  state: "Karnataka",
  postalCode: "560025",
} as const;

const PRODUCT_SEEDS = [
  { name: "Pineapple", brand: "Vedaa Fresh", category: "fruits", packageSize: "1", packageUnit: "kg", mrp: 40, sellingPrice: 40, stock: 25, image: "https://images.unsplash.com/photo-1550258987-190a2d41a8ba?auto=format&fit=crop&w=900&q=80" },
  { name: "Banana 5 inch", brand: "Vedaa Fresh", category: "fruits", packageSize: "1", packageUnit: "dozen", mrp: 40, sellingPrice: 40, stock: 30, image: "https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?auto=format&fit=crop&w=900&q=80" },
  { name: "Banana 8 inch", brand: "Vedaa Fresh", category: "fruits", packageSize: "1", packageUnit: "dozen", mrp: 50, sellingPrice: 50, stock: 24, image: "https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?auto=format&fit=crop&w=900&q=80" },
  { name: "Himalayan Apple", brand: "Fresh Harvest", category: "fruits", packageSize: "1", packageUnit: "kg", mrp: 110, sellingPrice: 110, stock: 20, image: "https://images.unsplash.com/photo-1567306226416-28f0efdc88ce?auto=format&fit=crop&w=900&q=80" },
  { name: "California Apple", brand: "Fresh Harvest", category: "fruits", packageSize: "1", packageUnit: "kg", mrp: 210, sellingPrice: 210, stock: 16, image: "https://images.unsplash.com/photo-1567306226416-28f0efdc88ce?auto=format&fit=crop&w=900&q=80" },
  { name: "Pomegranate", brand: "Fresh Harvest", category: "fruits", packageSize: "1", packageUnit: "kg", mrp: 150, sellingPrice: 150, stock: 18, image: "https://images.unsplash.com/photo-1694955729257-cb51cc4bd964?w=900&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=NHwxMjA3fDA%3D" },
  { name: "Papaya", brand: "Fresh Harvest", category: "fruits", packageSize: "1", packageUnit: "kg", mrp: 80, sellingPrice: 80, stock: 22, image: "https://images.unsplash.com/photo-1519996521430-02b2ee776e56?auto=format&fit=crop&w=900&q=80" },
  { name: "Guava", brand: "Vedaa Fresh", category: "fruits", packageSize: "1", packageUnit: "kg", mrp: 40, sellingPrice: 40, stock: 30, image: "https://images.unsplash.com/photo-1689996647327-5d263fbbc79d?w=900&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=NHwxMjA3fDA%3D" },
  { name: "Orange", brand: "Citrus Select", category: "fruits", packageSize: "1", packageUnit: "kg", mrp: 8, sellingPrice: 8, stock: 40, image: "https://images.unsplash.com/photo-1547514701-42782101795e?auto=format&fit=crop&w=900&q=80" },
  { name: "Custard Apple", brand: "Fresh Harvest", category: "fruits", packageSize: "1", packageUnit: "kg", mrp: 100, sellingPrice: 100, stock: 15, image: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQktcOPtg3QMqbncp4W2Yil9Qg9-l32L_7dEbtVgcnLQA&s=10" },
  { name: "Brown Coconut", brand: "Vedaa Fresh", category: "fruits", packageSize: "1", packageUnit: "kg", mrp: 30, sellingPrice: 30, stock: 18, image: "https://images.unsplash.com/photo-1553787434-dd9eb4ea4d0b?w=900&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=NHwxMjA3fDA%3D" },
  { name: "Green Coconut", brand: "Vedaa Fresh", category: "fruits", packageSize: "1", packageUnit: "kg", mrp: 90, sellingPrice: 90, stock: 12, image: "https://images.unsplash.com/photo-1659057106967-1144bfb2fe18?w=900&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=NHwxMjA3fDA%3D" },
  { name: "Tomato", brand: "Local Farm", category: "vegetables", packageSize: "1", packageUnit: "kg", mrp: 40, sellingPrice: 40, stock: 35, image: "https://images.unsplash.com/photo-1546094096-0df4bcaaa337?auto=format&fit=crop&w=900&q=80" },
  { name: "Pumpkin", brand: "Local Farm", category: "vegetables", packageSize: "1", packageUnit: "kg", mrp: 30, sellingPrice: 30, stock: 20, image: "https://images.unsplash.com/photo-1648996072798-3dc6c9c9d266?w=900&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=NHwxMjA3fDA%3D" },
  { name: "Capsicum", brand: "Green Basket", category: "vegetables", packageSize: "1", packageUnit: "kg", mrp: 80, sellingPrice: 80, stock: 26, image: "https://images.unsplash.com/photo-1563565375-f3fdfdbefa83?auto=format&fit=crop&w=900&q=80" },
  { name: "Garlic", brand: "Local Farm", category: "vegetables", packageSize: "1", packageUnit: "kg", mrp: 120, sellingPrice: 120, stock: 18, image: "https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&w=900&q=80" },
  { name: "Onion", brand: "Local Farm", category: "vegetables", packageSize: "1", packageUnit: "kg", mrp: 50, sellingPrice: 50, stock: 42, image: "https://images.unsplash.com/photo-1518977676601-b53f82aba655?auto=format&fit=crop&w=900&q=80" },
  { name: "Cauliflower", brand: "Green Basket", category: "vegetables", packageSize: "1", packageUnit: "kg", mrp: 40, sellingPrice: 40, stock: 18, image: "https://images.unsplash.com/photo-1566842600175-97dca489844f?w=900&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=NHwxMjA3fDA%3D" },
  { name: "Spinach", brand: "Green Basket", category: "vegetables", packageSize: "1", packageUnit: "kg", mrp: 30, sellingPrice: 30, stock: 24, image: "https://images.unsplash.com/photo-1576045057995-568f588f82fb?auto=format&fit=crop&w=900&q=80" },
  { name: "Pudina", brand: "Green Basket", category: "vegetables", packageSize: "1", packageUnit: "kg", mrp: 40, sellingPrice: 40, stock: 18, image: "https://images.unsplash.com/photo-1615485290382-441e4d049cb5?auto=format&fit=crop&w=900&q=80" },
  { name: "Potato", brand: "Local Farm", category: "vegetables", packageSize: "1", packageUnit: "kg", mrp: 10, sellingPrice: 10, stock: 50, image: "https://images.unsplash.com/photo-1518977676601-b53f82aba655?auto=format&fit=crop&w=900&q=80" },
  { name: "Cucumber", brand: "Local Farm", category: "vegetables", packageSize: "1", packageUnit: "kg", mrp: 40, sellingPrice: 40, stock: 28, image: "https://images.unsplash.com/photo-1676043966926-c575c1ef320a?w=900&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=NHwxMjA3fDA%3D" },
  { name: "Beetroot", brand: "Green Basket", category: "vegetables", packageSize: "1", packageUnit: "kg", mrp: 50, sellingPrice: 50, stock: 20, image: "https://images.unsplash.com/photo-1663961355715-cf362778dc0e?w=900&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=NHwxMjA3fDA%3D" },
  { name: "Brinjal", brand: "Local Farm", category: "vegetables", packageSize: "1", packageUnit: "kg", mrp: 30, sellingPrice: 30, stock: 24, image: "https://images.unsplash.com/photo-1639428134238-b548770d4b77?w=900&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=NHwxMjA3fDA%3D" },
  { name: "Cabbage", brand: "Green Basket", category: "vegetables", packageSize: "1", packageUnit: "kg", mrp: 20, sellingPrice: 20, stock: 26, image: "https://images.unsplash.com/photo-1594282486552-05b4d80fbb9f?w=900&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=NHwxMjA3fDA%3D" },
  { name: "French Beans", brand: "Local Farm", category: "vegetables", packageSize: "1", packageUnit: "kg", mrp: 20, sellingPrice: 20, stock: 22, image: "https://images.unsplash.com/photo-1574963835594-61eede2070dc?w=900&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=NHwxMjA3fDA%3D" },
  { name: "Lemon", brand: "Fresh Harvest", category: "fruits", packageSize: "1", packageUnit: "kg", mrp: 70, sellingPrice: 70, stock: 18, image: "https://images.unsplash.com/photo-1590502593747-42a996133562?w=900&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=NHwxMjA3fDA%3D" },
  { name: "Bottle Gourd", brand: "Local Farm", category: "vegetables", packageSize: "1", packageUnit: "kg", mrp: 20, sellingPrice: 20, stock: 16, image: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQSJanQyAdar9EzU0BPO8Dq52jWCv0lr4RSYqc0A_sY_g&s=10" },
  { name: "Lady Finger", brand: "Local Farm", category: "vegetables", packageSize: "1", packageUnit: "kg", mrp: 40, sellingPrice: 40, stock: 18, image: "https://images.unsplash.com/photo-1664289242854-e99d345cfa92?w=900&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=NHwxMjA3fDA%3D" },
  { name: "Green Chillies", brand: "Green Basket", category: "vegetables", packageSize: "1", packageUnit: "kg", mrp: 30, sellingPrice: 30, stock: 22, image: "https://images.unsplash.com/photo-1576763595295-c0371a32af78?w=900&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=NHwxMjA3fDA%3D" },
  { name: "Coriander", brand: "Green Basket", category: "vegetables", packageSize: "1", packageUnit: "kg", mrp: 30, sellingPrice: 30, stock: 20, image: "https://images.unsplash.com/photo-1535189487909-a262ad10c165?w=900&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=NHwxMjA3fDA%3D" },
  { name: "Ginger", brand: "Local Farm", category: "vegetables", packageSize: "1", packageUnit: "kg", mrp: 40, sellingPrice: 40, stock: 22, image: "https://images.unsplash.com/photo-1630623093145-f606591c2546?w=900&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=NHwxMjA3fDA%3D" },
  { name: "Aashirvaad Atta", brand: "Aashirvaad", category: "atta-rice-dal", packageSize: "5", packageUnit: "kg", mrp: 289, sellingPrice: 269, stock: 37, image: "https://images.unsplash.com/photo-1610725664285-7c57e6eeac3f?w=900&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=NHwxMjA3fDA%3D" },
  { name: "Basmati Rice", brand: "Daawat", category: "atta-rice-dal", packageSize: "1", packageUnit: "kg", mrp: 169, sellingPrice: 149, stock: 44, image: "https://images.unsplash.com/photo-1586201375761-83865001e31c?w=900&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=NHwxMjA3fDA%3D" },
  { name: "Toor Dal", brand: "Suryodaya", category: "atta-rice-dal", packageSize: "1", packageUnit: "kg", mrp: 139, sellingPrice: 119, stock: 31, image: "https://images.unsplash.com/photo-1723999817243-e18f2904b140?w=900&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=NHwxMjA3fDA%3D" },
  { name: "Moong Dal", brand: "Suryodaya", category: "atta-rice-dal", packageSize: "1", packageUnit: "kg", mrp: 128, sellingPrice: 109, stock: 26, image: "https://images.unsplash.com/photo-1702041357314-db5826c96f04?w=900&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=NHwxMjA3fDA%3D" },
  { name: "Amul Taaza Milk", brand: "Amul", category: "dairy-bread-eggs", packageSize: "1", packageUnit: "L", mrp: 68, sellingPrice: 62, stock: 50, image: "https://images.unsplash.com/photo-1550583724-b2692b85b150?auto=format&fit=crop&w=800&q=80" },
  { name: "Farm Fresh Eggs", brand: "Vedaa Fresh", category: "dairy-bread-eggs", packageSize: "12", packageUnit: "pcs", mrp: 96, sellingPrice: 82, stock: 24, image: "https://images.unsplash.com/photo-1518569656558-1f25e69d93d0?auto=format&fit=crop&w=800&q=80" },
  { name: "Whole Wheat Bread", brand: "Britannia", category: "dairy-bread-eggs", packageSize: "400", packageUnit: "g", mrp: 52, sellingPrice: 46, stock: 33, image: "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=800&q=80" },
  { name: "Paneer Cubes", brand: "Happy Cows", category: "dairy-bread-eggs", packageSize: "200", packageUnit: "g", mrp: 110, sellingPrice: 96, stock: 19, image: "https://images.unsplash.com/photo-1631452180519-c014fe946bc7?auto=format&fit=crop&w=800&q=80" },
  { name: "Classic Salted Chips", brand: "Lay's", category: "snacks-munchies", packageSize: "52", packageUnit: "g", mrp: 30, sellingPrice: 25, stock: 70, image: "https://images.unsplash.com/photo-1613919113640-25732ec5e61f?w=900&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=NHwxMjA3fDA%3D" },
  { name: "Masala Peanuts", brand: "Nutty Bite", category: "snacks-munchies", packageSize: "200", packageUnit: "g", mrp: 75, sellingPrice: 64, stock: 29, image: "https://images.unsplash.com/photo-1690200271569-8af83ea13411?w=900&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=NHwxMjA3fDA%3D" },
  { name: "Parle-G Biscuits", brand: "Parle", category: "bakery-biscuits", packageSize: "200", packageUnit: "g", mrp: 60, sellingPrice: 48, stock: 80, image: "https://images.unsplash.com/photo-1706380062542-c64d66badf8f?w=900&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=NHwxMjA3fDA%3D" },
  { name: "Dark Chocolate Cookies", brand: "Sunfeast", category: "bakery-biscuits", packageSize: "250", packageUnit: "g", mrp: 92, sellingPrice: 78, stock: 41, image: "https://images.unsplash.com/photo-1499636136210-6d10c4dbd3dd?auto=format&fit=crop&w=800&q=80" },
  { name: "Coca Cola", brand: "Coca-Cola", category: "cold-drinks-juices", packageSize: "750", packageUnit: "ml", mrp: 55, sellingPrice: 48, stock: 63, image: "https://images.unsplash.com/photo-1554866585-cd94860890b7?w=900&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=NHwxMjA3fDA%3D" },
  { name: "Orange Juice", brand: "Real", category: "cold-drinks-juices", packageSize: "1", packageUnit: "L", mrp: 125, sellingPrice: 106, stock: 27, image: "https://images.unsplash.com/photo-1621506289937-a8e4df240d0b?auto=format&fit=crop&w=800&q=80" },
  { name: "Mango Juice", brand: "Tropicana", category: "cold-drinks-juices", packageSize: "1", packageUnit: "L", mrp: 140, sellingPrice: 119, stock: 23, image: "https://images.unsplash.com/photo-1697642452436-9c40773cbcbb?w=900&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=NHwxMjA3fDA%3D" },
  { name: "Oats Meal", brand: "Saffola", category: "breakfast-instant-food", packageSize: "500", packageUnit: "g", mrp: 170, sellingPrice: 149, stock: 14, image: "https://images.unsplash.com/photo-1632737173811-cfc7bf387a12?w=900&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=NHwxMjA3fDA%3D" },
  { name: "Masala Oats", brand: "Saffola", category: "breakfast-instant-food", packageSize: "500", packageUnit: "g", mrp: 135, sellingPrice: 118, stock: 20, image: "https://images.unsplash.com/photo-1614961233913-a5113a4a34ed?w=900&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=NHwxMjA3fDA%3D" },
  { name: "Instant Noodles", brand: "Maggi", category: "breakfast-instant-food", packageSize: "280", packageUnit: "g", mrp: 52, sellingPrice: 46, stock: 72, image: "https://images.unsplash.com/photo-1612929633738-8fe44f7ec841?w=900&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=NHwxMjA3fDA%3D" },
  { name: "Dove Soap", brand: "Dove", category: "personal-care", packageSize: "125", packageUnit: "g", mrp: 100, sellingPrice: 84, stock: 39, image: "https://images.unsplash.com/photo-1558616180-d76238959a2e?w=900&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=NHwxMjA3fDA%3D" },
  { name: "Toothpaste", brand: "Colgate", category: "personal-care", packageSize: "150", packageUnit: "g", mrp: 99, sellingPrice: 88, stock: 34, image: "https://images.unsplash.com/photo-1612705166160-97d3b2e8e212?w=900&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=NHwxMjA3fDA%3D" },
  { name: "Shampoo", brand: "Head & Shoulders", category: "personal-care", packageSize: "650", packageUnit: "ml", mrp: 249, sellingPrice: 219, stock: 17, image: "https://images.unsplash.com/photo-1747858989102-cca0f4dc4a11?w=900&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=NHwxMjA3fDA%3D" },
  { name: "Dish Wash Liquid", brand: "Pril", category: "cleaning-household", packageSize: "500", packageUnit: "ml", mrp: 120, sellingPrice: 104, stock: 21, image: "https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&w=800&q=80" },
  { name: "Surface Cleaner", brand: "Lizol", category: "cleaning-household", packageSize: "500", packageUnit: "ml", mrp: 190, sellingPrice: 169, stock: 16, image: "https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&w=800&q=80" },
  { name: "Garbage Bags", brand: "Vedaa Home", category: "cleaning-household", packageSize: "30", packageUnit: "pcs", mrp: 86, sellingPrice: 74, stock: 26, image: "https://images.unsplash.com/photo-1606037150583-fb842a55bae7?w=900&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=NHwxMjA3fDA%3D" },
  { name: "Almonds", brand: "NutriChoice", category: "dry-fruits-nuts", packageSize: "250", packageUnit: "g", mrp: 185, sellingPrice: 169, stock: 18, image: "https://images.unsplash.com/photo-1608797178974-15b35a64ede9?w=900&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=NHwxMjA3fDA%3D" },
  { name: "Cashews", brand: "NutriChoice", category: "dry-fruits-nuts", packageSize: "250", packageUnit: "g", mrp: 210, sellingPrice: 189, stock: 15, image: "https://images.unsplash.com/photo-1641718111847-7e509a4dd208?w=900&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=NHwxMjA3fDA%3D" },
  { name: "Mixed Dry Fruits", brand: "Munchy Bites", category: "dry-fruits-nuts", packageSize: "500", packageUnit: "g", mrp: 360, sellingPrice: 329, stock: 12, image: "https://plus.unsplash.com/premium_photo-1668677227454-213252229b73?w=900&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=NHwxMjA3fDA%3D" },
] as const;

const DEMO_USERS = [
  { email: "admin@vedaamart.test", name: "Vedaa Admin", password: "VedaaAdmin@123", role: "ADMIN" },
  { email: "customer@vedaamart.test", name: "Vedaa Customer", password: "VedaaUser@123", role: "CUSTOMER" },
] as const;

function ensureSafeEnvironment() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Seed script refuses to run in production. Use NODE_ENV=development and an explicit dev database target.");
  }
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required. Use the repo .env or pass DATABASE_URL explicitly.");
  }
}

function normalizeSlug(input: string) {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

async function main() {
  ensureSafeEnvironment();

  const legacyCombinedCategory = await prisma.category.findUnique({
    where: { slug: "fruits-vegetables" },
    include: { products: { select: { id: true } } },
  });

  if (legacyCombinedCategory) {
    const legacyProductIds = legacyCombinedCategory.products.map((product) => product.id);
    if (legacyProductIds.length > 0) {
      await prisma.productImage.deleteMany({
        where: { productId: { in: legacyProductIds } },
      });
      await prisma.product.deleteMany({
        where: { id: { in: legacyProductIds } },
      });
    }
    await prisma.category.delete({
      where: { id: legacyCombinedCategory.id },
    });
  }

  const store = await prisma.store.upsert({
    where: { slug: STORE_SEED.slug },
    update: {
      name: STORE_SEED.name,
      address: STORE_SEED.address,
      addressLine: STORE_SEED.addressLine,
      city: STORE_SEED.city,
      state: STORE_SEED.state,
      postalCode: STORE_SEED.postalCode,
      isActive: true,
    },
    create: {
      ...STORE_SEED,
      isActive: true,
    },
  });

  for (const category of CATEGORY_SEEDS) {
    await prisma.category.upsert({
      where: { slug: category.slug },
      update: {
        name: category.name,
        description: category.description,
        isActive: true,
      },
      create: {
        ...category,
        imageUrl: `https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=800&q=80`,
        sortOrder: CATEGORY_SEEDS.findIndex((item) => item.slug === category.slug),
      },
    });
  }

  let createdProducts = 0;
  for (const productSeed of PRODUCT_SEEDS) {
    const slug = normalizeSlug(productSeed.name);
    const product = await prisma.product.upsert({
      where: { slug },
      update: {
        name: productSeed.name,
        brand: productSeed.brand,
        packageSize: productSeed.packageSize,
        packageUnit: productSeed.packageUnit,
        mrp: productSeed.mrp,
        sellingPrice: productSeed.sellingPrice,
        isActive: true,
        category: { connect: { slug: productSeed.category } },
      },
      create: {
        name: productSeed.name,
        slug,
        sku: `DEV-${normalizeSlug(productSeed.brand ?? "value")}-${normalizeSlug(productSeed.name)}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
        brand: productSeed.brand,
        description: `${productSeed.name} from the Vedaa Mart development catalog. This data is for testing only.`,
        packageSize: productSeed.packageSize,
        packageUnit: productSeed.packageUnit,
        mrp: productSeed.mrp,
        sellingPrice: productSeed.sellingPrice,
        category: { connect: { slug: productSeed.category } },
      },
    });

    await prisma.productImage.deleteMany({
      where: { productId: product.id },
    });

    await prisma.productImage.create({
      data: {
        productId: product.id,
        url: productSeed.image,
        alt: productSeed.name,
        sortOrder: 0,
      },
    });

    await prisma.storeInventory.upsert({
      where: {
        storeId_productId: {
          storeId: store.id,
          productId: product.id,
        },
      },
      update: {
        sellingPrice: productSeed.sellingPrice,
        isAvailable: true,
      },
      create: {
        storeId: store.id,
        productId: product.id,
        sellingPrice: productSeed.sellingPrice,
        stockQuantity: productSeed.stock,
        availableStock: productSeed.stock,
        reservedQuantity: 0,
        reservedStock: 0,
        lowStockThreshold: productSeed.stock < 10 ? 5 : 10,
        isAvailable: true,
      },
    });

    createdProducts += 1;
  }

  await prisma.coupon.upsert({
    where: { code: "VEDAA50" },
    update: { isActive: true, value: 50, minOrderValue: 399 },
    create: {
      code: "VEDAA50",
      type: "FIXED",
      value: 50,
      minOrderValue: 399,
      isActive: true,
    },
  });

  for (const demoUser of DEMO_USERS) {
    const passwordHash = await bcrypt.hash(demoUser.password, 10);
    const user = await prisma.user.upsert({
      where: { email: demoUser.email },
      update: {
        name: demoUser.name,
        role: demoUser.role,
        emailVerified: true,
        passwordHash,
      },
      create: {
        email: demoUser.email,
        name: demoUser.name,
        role: demoUser.role,
        emailVerified: true,
        passwordHash,
      },
    });

    const existingCredentialAccount = await prisma.account.findFirst({
      where: {
        userId: user.id,
        providerId: "credential",
      },
    });

    if (existingCredentialAccount) {
      await prisma.account.update({
        where: { id: existingCredentialAccount.id },
        data: {
          accountId: user.id,
          password: passwordHash,
        },
      });
    } else {
      await prisma.account.create({
        data: {
          userId: user.id,
          accountId: user.id,
          providerId: "credential",
          password: passwordHash,
        },
      });
    }
  }

  console.info(`Seed complete. Categories: ${CATEGORY_SEEDS.length}. Products: ${createdProducts}. Store: ${store.slug}. Demo users: ${DEMO_USERS.length}`);
}

main()
  .catch((error: unknown) => {
    console.error("Seed failed:", error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
