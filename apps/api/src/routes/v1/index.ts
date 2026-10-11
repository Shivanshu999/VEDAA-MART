import { Hono } from "hono";
import type { Auth } from "../../lib/auth.js";
import type { Env } from "../../env.js";
import { createProductsRoutes } from "./products.js";
import { createCategoriesRoutes } from "./categories.js";
import { createDeliveryRoutes } from "./delivery.js";
import { createCartRoutes } from "./cart.js";
import { createAddressesRoutes } from "./addresses.js";
import { createOrdersRoutes } from "./orders.js";
import { createPaymentsRoutes } from "./payments.js";
import { createAdminRoutes } from "./admin.js";
import { createStaffOrderRoutes } from "./staff-orders.js";
import { createPaymentService } from "../../modules/payments/payment.service.js";

export function createV1Routes(auth: Auth, env: Env) {
  const v1 = new Hono();
  const paymentService = createPaymentService(env);

  v1.route("/products", createProductsRoutes());
  v1.route("/categories", createCategoriesRoutes());
  v1.route("/delivery", createDeliveryRoutes());
  v1.route("/cart", createCartRoutes(auth));
  v1.route("/addresses", createAddressesRoutes(auth));
  v1.route("/orders", createOrdersRoutes(auth));
  v1.route("/payments", createPaymentsRoutes(auth, paymentService));
  v1.route("/admin", createAdminRoutes(auth));
  v1.route("/staff/orders", createStaffOrderRoutes(auth));

  return v1;
}
