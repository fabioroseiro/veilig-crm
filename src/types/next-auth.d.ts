import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id?: string;
      role?: "veilig_admin" | "group_admin" | "store_manager" | "store_admin";
      groupId?: string | null;
      storeId?: string | null;
      precisaTrocarSenha?: boolean;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    uid?: string;
    role?: "veilig_admin" | "group_admin" | "store_manager" | "store_admin";
    groupId?: string | null;
    storeId?: string | null;
    precisaTrocarSenha?: boolean;
  }
}
