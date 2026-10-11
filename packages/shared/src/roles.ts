export const UserRole = {
  CUSTOMER: "CUSTOMER",
  ADMIN: "ADMIN",
  STORE_MANAGER: "STORE_MANAGER",
  STORE_STAFF: "STORE_STAFF",
} as const;

export type UserRole = (typeof UserRole)[keyof typeof UserRole];
