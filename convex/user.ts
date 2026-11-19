import { mutation } from "./_generated/server";

export const CreateNewUser = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthenticated");
    }

    const email = identity.email ?? "";
    const name = identity.name ?? identity.nickname ?? "No Name";

    const existingUsers = await ctx.db
      .query("UserTable")
      .filter((q) => q.eq(q.field("email"), email))
      .collect();

    if (existingUsers.length === 0) {
      const userData = {
        name,
        email,
        token: 5000,
      };
      await ctx.db.insert("UserTable", userData);
      return userData;
    }
    return existingUsers[0];
  },
});