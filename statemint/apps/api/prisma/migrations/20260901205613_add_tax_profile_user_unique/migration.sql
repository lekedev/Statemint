/*
  Warnings:

  - A unique constraint covering the columns `[user_id]` on the table `tax_profiles` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "tax_profiles_user_id_key" ON "tax_profiles"("user_id");
