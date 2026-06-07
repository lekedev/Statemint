-- CreateEnum
CREATE TYPE "TaxUserType" AS ENUM ('PAYE', 'SELF_EMPLOYED', 'BUSINESS');

-- CreateTable
CREATE TABLE "tax_profiles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "userType" "TaxUserType" NOT NULL,
    "state_of_residence" TEXT NOT NULL,
    "monthly_rent" DECIMAL(12,2),
    "pension_rate" DOUBLE PRECISION NOT NULL DEFAULT 0.08,
    "nhf_rate" DOUBLE PRECISION NOT NULL DEFAULT 0.025,
    "nhis_rate" DOUBLE PRECISION NOT NULL DEFAULT 0.05,
    "life_insurance" DECIMAL(12,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tax_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_calculations" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "tax_profile_id" TEXT NOT NULL,
    "userType" "TaxUserType" NOT NULL,
    "tax_year" INTEGER NOT NULL,
    "gross_income" DECIMAL(12,2) NOT NULL,
    "total_deductions" DECIMAL(12,2) NOT NULL,
    "chargeable_income" DECIMAL(12,2) NOT NULL,
    "total_tax" DECIMAL(12,2) NOT NULL,
    "effective_rate" DOUBLE PRECISION NOT NULL,
    "monthly_tax" DECIMAL(12,2) NOT NULL,
    "breakdown" JSONB NOT NULL,
    "deductions" JSONB NOT NULL,
    "checklist" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tax_calculations_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "tax_profiles" ADD CONSTRAINT "tax_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_calculations" ADD CONSTRAINT "tax_calculations_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_calculations" ADD CONSTRAINT "tax_calculations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_calculations" ADD CONSTRAINT "tax_calculations_tax_profile_id_fkey" FOREIGN KEY ("tax_profile_id") REFERENCES "tax_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
