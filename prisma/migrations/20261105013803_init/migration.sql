-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('CASH', 'DIGITAL_WALLET', 'BANK', 'SAVINGS', 'CREDIT_CARD', 'OTHER');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('INCOME', 'EXPENSE', 'TRANSFER', 'CARD_PAYMENT', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('CONFIRMED', 'PENDING');

-- CreateEnum
CREATE TYPE "TransactionSource" AS ENUM ('MANUAL', 'VOICE', 'RECURRING');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'DEBIT_CARD', 'CREDIT_CARD', 'BANK_TRANSFER', 'DIGITAL_WALLET', 'DIRECT_DEBIT', 'OTHER');

-- CreateEnum
CREATE TYPE "CategoryKind" AS ENUM ('EXPENSE', 'INCOME');

-- CreateEnum
CREATE TYPE "RecurrenceUnit" AS ENUM ('DAY', 'WEEK', 'MONTH', 'YEAR');

-- CreateEnum
CREATE TYPE "RecurringAmountType" AS ENUM ('FIXED', 'VARIABLE');

-- CreateEnum
CREATE TYPE "OccurrenceStatus" AS ENUM ('GENERATED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "VoiceInputType" AS ENUM ('AUDIO', 'TEXT');

-- CreateEnum
CREATE TYPE "VoiceEntryStatus" AS ENUM ('PROCESSING', 'NEEDS_REVIEW', 'SAVED', 'UNDONE', 'DISCARDED', 'FAILED');

-- CreateEnum
CREATE TYPE "SavingsGoalKind" AS ENUM ('EMERGENCY_FUND', 'CAR', 'TRAVEL', 'BIG_PURCHASE', 'CUSTOM');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "timezone" VARCHAR(64) NOT NULL DEFAULT 'America/Argentina/Cordoba',
    "currency" CHAR(3) NOT NULL DEFAULT 'ARS',
    "tracking_start_date" DATE,
    "onboarded_at" TIMESTAMPTZ(3),
    "default_account_id" UUID,
    "voice_auto_save" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "type" "AccountType" NOT NULL,
    "institution" VARCHAR(60),
    "currency" CHAR(3) NOT NULL DEFAULT 'ARS',
    "opening_balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "opening_date" DATE NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_cards" (
    "account_id" UUID NOT NULL,
    "credit_limit" DECIMAL(14,2),
    "closing_day" INTEGER NOT NULL,
    "due_day" INTEGER NOT NULL,
    "payment_account_id" UUID,
    "opening_statement_balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "opening_unbilled_balance" DECIMAL(14,2) NOT NULL DEFAULT 0,

    CONSTRAINT "credit_cards_pkey" PRIMARY KEY ("account_id")
);

-- CreateTable
CREATE TABLE "card_cycle_overrides" (
    "id" UUID NOT NULL,
    "card_account_id" UUID NOT NULL,
    "period" CHAR(7) NOT NULL,
    "closing_date" DATE NOT NULL,
    "due_date" DATE NOT NULL,

    CONSTRAINT "card_cycle_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "parent_id" UUID,
    "kind" "CategoryKind" NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "icon" VARCHAR(40) NOT NULL,
    "color" VARCHAR(20) NOT NULL,
    "is_fixed_default" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "merchants" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "normalized_name" VARCHAR(80) NOT NULL,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "default_category_id" UUID,
    "usage_count" INTEGER NOT NULL DEFAULT 0,
    "last_used_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "merchants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "client_id" UUID,
    "type" "TransactionType" NOT NULL,
    "status" "TransactionStatus" NOT NULL DEFAULT 'CONFIRMED',
    "source" "TransactionSource" NOT NULL DEFAULT 'MANUAL',
    "date" DATE NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'ARS',
    "description" VARCHAR(140) NOT NULL,
    "notes" VARCHAR(1000),
    "account_id" UUID NOT NULL,
    "to_account_id" UUID,
    "category_id" UUID,
    "merchant_id" UUID,
    "payment_method" "PaymentMethod",
    "is_fixed" BOOLEAN NOT NULL DEFAULT false,
    "voice_entry_id" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "installment_plans" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "card_account_id" UUID NOT NULL,
    "transaction_id" UUID,
    "description" VARCHAR(140) NOT NULL,
    "installment_count" INTEGER NOT NULL,
    "first_installment_number" INTEGER NOT NULL DEFAULT 1,
    "first_period" CHAR(7) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "installment_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "installments" (
    "id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "installments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recurring_rules" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "type" "TransactionType" NOT NULL,
    "amount_type" "RecurringAmountType" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "account_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "merchant_id" UUID,
    "payment_method" "PaymentMethod",
    "is_fixed" BOOLEAN NOT NULL DEFAULT true,
    "unit" "RecurrenceUnit" NOT NULL,
    "interval" INTEGER NOT NULL DEFAULT 1,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "requires_confirmation" BOOLEAN NOT NULL DEFAULT false,
    "notes" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "recurring_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recurring_occurrences" (
    "id" UUID NOT NULL,
    "rule_id" UUID NOT NULL,
    "period_key" VARCHAR(16) NOT NULL,
    "due_date" DATE NOT NULL,
    "status" "OccurrenceStatus" NOT NULL,
    "transaction_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recurring_occurrences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "savings_goals" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "kind" "SavingsGoalKind" NOT NULL,
    "target_amount" DECIMAL(14,2) NOT NULL,
    "target_date" DATE,
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "savings_goals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "savings_allocations" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "goal_id" UUID NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "date" DATE NOT NULL,
    "note" VARCHAR(200),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "savings_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voice_entries" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "client_request_id" UUID NOT NULL,
    "input_type" "VoiceInputType" NOT NULL,
    "status" "VoiceEntryStatus" NOT NULL,
    "transcript" VARCHAR(2000),
    "audio_duration_ms" INTEGER,
    "audio_mime_type" VARCHAR(60),
    "audio_bytes" INTEGER,
    "stt_model" VARCHAR(60),
    "interpreter_model" VARCHAR(60),
    "items" JSONB,
    "error_code" VARCHAR(60),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMPTZ(3),
    "resolved_at" TIMESTAMPTZ(3),

    CONSTRAINT "voice_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" VARCHAR(64) NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_agent" VARCHAR(200),

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_limit_buckets" (
    "key" VARCHAR(160) NOT NULL,
    "window_start" TIMESTAMPTZ(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "rate_limit_buckets_pkey" PRIMARY KEY ("key","window_start")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "action" VARCHAR(40) NOT NULL,
    "entity_type" VARCHAR(40),
    "entity_id" VARCHAR(64),
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "accounts_user_id_type_idx" ON "accounts"("user_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_user_id_name_key" ON "accounts"("user_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "card_cycle_overrides_card_account_id_period_key" ON "card_cycle_overrides"("card_account_id", "period");

-- CreateIndex
CREATE INDEX "categories_user_id_kind_idx" ON "categories"("user_id", "kind");

-- CreateIndex
CREATE INDEX "categories_parent_id_idx" ON "categories"("parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "merchants_user_id_normalized_name_key" ON "merchants"("user_id", "normalized_name");

-- CreateIndex
CREATE INDEX "transactions_user_id_date_idx" ON "transactions"("user_id", "date" DESC);

-- CreateIndex
CREATE INDEX "transactions_user_id_status_idx" ON "transactions"("user_id", "status");

-- CreateIndex
CREATE INDEX "transactions_account_id_date_idx" ON "transactions"("account_id", "date");

-- CreateIndex
CREATE INDEX "transactions_to_account_id_date_idx" ON "transactions"("to_account_id", "date");

-- CreateIndex
CREATE INDEX "transactions_category_id_idx" ON "transactions"("category_id");

-- CreateIndex
CREATE INDEX "transactions_merchant_id_idx" ON "transactions"("merchant_id");

-- CreateIndex
CREATE INDEX "transactions_voice_entry_id_idx" ON "transactions"("voice_entry_id");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_user_id_client_id_key" ON "transactions"("user_id", "client_id");

-- CreateIndex
CREATE UNIQUE INDEX "installment_plans_transaction_id_key" ON "installment_plans"("transaction_id");

-- CreateIndex
CREATE INDEX "installment_plans_card_account_id_idx" ON "installment_plans"("card_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "installments_plan_id_number_key" ON "installments"("plan_id", "number");

-- CreateIndex
CREATE INDEX "recurring_rules_user_id_is_active_idx" ON "recurring_rules"("user_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "recurring_occurrences_transaction_id_key" ON "recurring_occurrences"("transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "recurring_occurrences_rule_id_period_key_key" ON "recurring_occurrences"("rule_id", "period_key");

-- CreateIndex
CREATE INDEX "savings_goals_user_id_idx" ON "savings_goals"("user_id");

-- CreateIndex
CREATE INDEX "savings_allocations_goal_id_idx" ON "savings_allocations"("goal_id");

-- CreateIndex
CREATE INDEX "voice_entries_user_id_status_idx" ON "voice_entries"("user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "voice_entries_user_id_client_request_id_key" ON "voice_entries"("user_id", "client_request_id");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

-- CreateIndex
CREATE INDEX "rate_limit_buckets_window_start_idx" ON "rate_limit_buckets"("window_start");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_created_at_idx" ON "audit_logs"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_default_account_id_fkey" FOREIGN KEY ("default_account_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_cards" ADD CONSTRAINT "credit_cards_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_cards" ADD CONSTRAINT "credit_cards_payment_account_id_fkey" FOREIGN KEY ("payment_account_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_cycle_overrides" ADD CONSTRAINT "card_cycle_overrides_card_account_id_fkey" FOREIGN KEY ("card_account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merchants" ADD CONSTRAINT "merchants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merchants" ADD CONSTRAINT "merchants_default_category_id_fkey" FOREIGN KEY ("default_category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_to_account_id_fkey" FOREIGN KEY ("to_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_voice_entry_id_fkey" FOREIGN KEY ("voice_entry_id") REFERENCES "voice_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installment_plans" ADD CONSTRAINT "installment_plans_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installment_plans" ADD CONSTRAINT "installment_plans_card_account_id_fkey" FOREIGN KEY ("card_account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installment_plans" ADD CONSTRAINT "installment_plans_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installments" ADD CONSTRAINT "installments_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "installment_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_rules" ADD CONSTRAINT "recurring_rules_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_rules" ADD CONSTRAINT "recurring_rules_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_rules" ADD CONSTRAINT "recurring_rules_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_rules" ADD CONSTRAINT "recurring_rules_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_occurrences" ADD CONSTRAINT "recurring_occurrences_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "recurring_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_occurrences" ADD CONSTRAINT "recurring_occurrences_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "savings_goals" ADD CONSTRAINT "savings_goals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "savings_allocations" ADD CONSTRAINT "savings_allocations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "savings_allocations" ADD CONSTRAINT "savings_allocations_goal_id_fkey" FOREIGN KEY ("goal_id") REFERENCES "savings_goals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voice_entries" ADD CONSTRAINT "voice_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Invariantes contables que Prisma no puede expresar (ver docs/DATABASE.md).
-- ---------------------------------------------------------------------------

-- Importes: positivos; solo los ajustes llevan signo (y nunca son cero).
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_amount_check"
  CHECK ((type = 'ADJUSTMENT' AND amount <> 0) OR (type <> 'ADJUSTMENT' AND amount > 0));

-- Transferencias y pagos de tarjeta tienen destino; el resto no.
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_to_account_check"
  CHECK ((type IN ('TRANSFER', 'CARD_PAYMENT')) = (to_account_id IS NOT NULL));

ALTER TABLE "transactions" ADD CONSTRAINT "transactions_distinct_accounts_check"
  CHECK (to_account_id IS NULL OR to_account_id <> account_id);

-- Solo ingresos y gastos se categorizan: transferencias, pagos y ajustes no son flujo.
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_check"
  CHECK ((type IN ('INCOME', 'EXPENSE')) = (category_id IS NOT NULL));

ALTER TABLE "transactions" ADD CONSTRAINT "transactions_description_check"
  CHECK (length(btrim(description)) > 0);

-- La deuda inicial de una tarjeta vive en credit_cards, nunca en el saldo de la cuenta.
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_card_opening_balance_check"
  CHECK (type <> 'CREDIT_CARD' OR opening_balance = 0);

ALTER TABLE "credit_cards" ADD CONSTRAINT "credit_cards_days_check"
  CHECK (closing_day BETWEEN 1 AND 31 AND due_day BETWEEN 1 AND 31);
ALTER TABLE "credit_cards" ADD CONSTRAINT "credit_cards_limit_check"
  CHECK (credit_limit IS NULL OR credit_limit > 0);
ALTER TABLE "credit_cards" ADD CONSTRAINT "credit_cards_opening_check"
  CHECK (opening_statement_balance >= 0 AND opening_unbilled_balance >= 0);

ALTER TABLE "card_cycle_overrides" ADD CONSTRAINT "card_cycle_overrides_period_check"
  CHECK (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$' AND to_char(closing_date, 'YYYY-MM') = period);
ALTER TABLE "card_cycle_overrides" ADD CONSTRAINT "card_cycle_overrides_dates_check"
  CHECK (due_date > closing_date);

ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_check"
  CHECK (parent_id IS NULL OR parent_id <> id);

ALTER TABLE "installment_plans" ADD CONSTRAINT "installment_plans_count_check"
  CHECK (installment_count BETWEEN 1 AND 72
     AND first_installment_number BETWEEN 1 AND installment_count
     AND first_period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');

ALTER TABLE "installments" ADD CONSTRAINT "installments_amount_check"
  CHECK (amount > 0 AND number >= 1);

ALTER TABLE "recurring_rules" ADD CONSTRAINT "recurring_rules_type_check"
  CHECK (type IN ('INCOME', 'EXPENSE'));
ALTER TABLE "recurring_rules" ADD CONSTRAINT "recurring_rules_amount_check"
  CHECK (amount > 0);
ALTER TABLE "recurring_rules" ADD CONSTRAINT "recurring_rules_schedule_check"
  CHECK ("interval" BETWEEN 1 AND 366 AND (end_date IS NULL OR end_date >= start_date));

ALTER TABLE "savings_goals" ADD CONSTRAINT "savings_goals_target_check"
  CHECK (target_amount > 0);
ALTER TABLE "savings_allocations" ADD CONSTRAINT "savings_allocations_amount_check"
  CHECK (amount <> 0);

ALTER TABLE "rate_limit_buckets" ADD CONSTRAINT "rate_limit_buckets_count_check"
  CHECK (count >= 0);
